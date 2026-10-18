import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, lstat, rename, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const contained = (root, file) => { const rel = path.relative(path.resolve(root), path.resolve(file)); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
export async function exists(file) { try { await lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), { flag: 'wx' }); await rename(tmp, file);
}
export function remap(value, mappings,field='') {
  if(['prompt','requirements','instruction','instructions','finalPrompt','description','text','name','title','notes','label','purpose','message','source'].includes(field)&&(typeof value==='string'||Array.isArray(value)))return value;
  if (typeof value === 'string') {
    for (const [from, to] of mappings) if (path.isAbsolute(value) && (value === from || contained(from, value))) return path.join(to, path.relative(from, value));
    return value;
  }
  if (Array.isArray(value)) return value.map(item => remap(item, mappings,field));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item, mappings,key)]));
  return value;
}
export async function initializeData(root, appVersion = '1.0.0') {
  const marker = path.join(root, 'Settings/version.json');
  if (await exists(marker)) { const saved = JSON.parse(await readFile(marker, 'utf8')); if (saved.dataSchemaVersion !== 1) throw new Error('数据版本不受支持，原文件未覆盖。');
    if(saved.appVersion&&saved.appVersion!==appVersion){
      const checkpoint=path.join(root,'Settings','Upgrade-Checkpoints',randomUUID());await mkdir(checkpoint,{recursive:true});
      for(const name of ['version.json','desktop.json','customization.json','data-identity.json']){const file=path.join(root,'Settings',name);if(!await exists(file))continue;const safe=await safeExisting(root,file),bytes=await readFile(safe);const parsed=JSON.parse(bytes);if(name==='customization.json'&&parsed.schema!==1)throw Error('个人设置版本不受支持，未覆盖。');await writeFile(path.join(checkpoint,name),bytes,{flag:'wx'});}
      await atomicJson(path.join(checkpoint,'checkpoint.json'),{from:saved.appVersion,to:appVersion,createdAt:new Date().toISOString(),scope:'critical-settings-only'});
    }
  }
  for (const dir of ['Projects', 'Skills', 'Tasks', 'Settings', 'Cache', 'Logs']) await mkdir(path.join(root, dir), { recursive: true });
  await atomicJson(marker, { appVersion, dataSchemaVersion: 1 });
}
export async function migrateLegacy(legacyWorkspace, target) {
  const oldRoot = path.join(path.resolve(legacyWorkspace), 'Skill Canvas Data');
  const desktopTasks = path.join(oldRoot, 'Tasks');
  const oldTasks = await exists(desktopTasks) ? desktopTasks : path.join(path.resolve(legacyWorkspace), '.skill-canvas/tasks');
  target = path.resolve(target);
  if (!await exists(oldRoot) || oldRoot === target || contained(oldRoot, target) || contained(target, oldRoot)) throw new Error('旧数据目录不存在或与新目录重叠。');
  if (await exists(target)) throw new Error('目标数据目录已经存在；拒绝覆盖，旧数据未修改。');
  await mkdir(path.dirname(target), { recursive: true });
  const stage = path.join(path.dirname(target), `Migration-${randomUUID()}`); await mkdir(stage);
  const mappings = [[oldTasks, path.join(target, 'Tasks')], [oldRoot, target], [await realpath(oldRoot), target]];
  if(await exists(oldTasks))mappings.unshift([await realpath(oldTasks),path.join(target,'Tasks')]);
  const copied = [], excluded = [];
  async function copyTree(source, destination) {
    const info = await lstat(source); if (info.isSymbolicLink()) throw new Error('迁移拒绝符号链接或 junction。');
    if (info.isDirectory()) {
      await mkdir(destination, { recursive: true });
      for (const entry of await readdir(source)) await copyTree(path.join(source, entry), path.join(destination, entry));
    } else if (info.isFile()) {
      const bytes = await readFile(source); await writeFile(destination, bytes, { flag: 'wx' });
      if (hash(await readFile(destination)) !== hash(bytes)) throw new Error('迁移文件校验失败。');
      copied.push({ source, destination, bytes: bytes.length, sha256: hash(bytes) });
    } else throw new Error('迁移遇到异常文件类型。');
  }
  for (const kind of ['Projects', 'Skills', 'Settings']) {
    const source = path.join(oldRoot, kind); if (!await exists(source)) continue;
    if ((await lstat(source)).isSymbolicLink()) throw new Error('迁移拒绝符号链接或 junction。');
    await mkdir(path.join(stage, kind));
    for (const id of await readdir(source)) {
      if (kind === 'Skills') {
        const file = path.join(source, id, 'metadata/record.json');
        if (await exists(file)) {
          const record = JSON.parse(await readFile(file, 'utf8')), manifest = record.versions?.[record.current]?.manifest;
          if (manifest?.categories?.includes('测试 Skill') && manifest.name === 'skill-canvas-update-test') { excluded.push(id); continue; }
        }
      }
      await copyTree(path.join(source, id), path.join(stage, kind, id));
    }
  }
  if (await exists(oldTasks)) {
    await mkdir(path.join(stage, 'Tasks'));
    for (const id of await readdir(oldTasks)) {
      const record = path.join(oldTasks, id, 'record.json');
      if (!await exists(record)) continue;
      const saved = JSON.parse(await readFile(record, 'utf8'));
      if (saved.action !== 'generate_image') { excluded.push(`task:${id}`); continue; }
      await copyTree(path.join(oldTasks, id), path.join(stage, 'Tasks', id));
    }
  }
  // Only metadata is rebased. SKILL.md, resource bundles, PNGs and historical instruction text remain byte-for-byte.
  for (const file of copied) {
    const relative = path.relative(stage, file.destination).replaceAll('\\', '/');
    if (/^(Projects\/[^/]+\/metadata\/project\.json|Skills\/[^/]+\/metadata\/record\.json|Tasks\/[^/]+\/(record|task)\.json)$/.test(relative)) {
      const changed = remap(JSON.parse(await readFile(file.destination, 'utf8')), mappings);
      await writeFile(file.destination, JSON.stringify(changed, null, 2));
      if (JSON.stringify(JSON.parse(await readFile(file.destination, 'utf8'))) !== JSON.stringify(changed)) throw new Error('迁移元数据校验失败。');
    }
  }
  await initializeData(stage);
  const report = { completedAt: new Date().toISOString(), legacyWorkspace: path.resolve(legacyWorkspace), target, copiedFiles: copied.length, copiedBytes: copied.reduce((n, f) => n + f.bytes, 0), excludedTestEntries: excluded, originalsPreserved: true };
  await atomicJson(path.join(stage, 'Settings/migration.json'), report);
  await rename(stage, target);
  return report;
}
export async function safeExisting(root, candidate) {
  const resolvedRoot = await realpath(root), resolved = await realpath(candidate);
  if (!contained(resolvedRoot, resolved)) throw new Error('文件不属于 Skill Canvas 数据目录。');
  return resolved;
}
export async function copyVerifiedDirectory(source,target) {
  if(!await exists(source))return false;
  if(await exists(target))throw new Error('缓存目标已经存在，拒绝覆盖。');
  const stage=target+'.'+randomUUID()+'.migration';
  async function copy(from,to){const info=await lstat(from);if(info.isSymbolicLink())throw new Error('缓存迁移拒绝链接。');if(info.isDirectory()){await mkdir(to,{recursive:true});for(const name of await readdir(from))await copy(path.join(from,name),path.join(to,name));}else if(info.isFile()){const bytes=await readFile(from);await writeFile(to,bytes,{flag:'wx'});if(hash(await readFile(to))!==hash(bytes))throw new Error('缓存迁移校验失败。');}else throw new Error('缓存迁移文件类型无效。');}
  await copy(source,stage);await rename(stage,target);return true;
}
