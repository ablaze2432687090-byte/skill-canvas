import test from 'node:test';
import assert from 'node:assert/strict';
import { readSkillManifest, normalizeParameters, safeRelativePath, safeRepository } from '../../src/domain/manifest.ts';
import { scanSkillSnapshots } from '../../src/application/scanSkills.ts';
import { mockRunner } from '../../src/adapters/mockRunner.ts';
import { demoManifests } from '../../src/application/skillViews.ts';
import { defaultDraft } from '../../src/fixtures/demoGenerations.ts';
import type { RootSnapshot } from '../../src/ports';
import type { StorageBridge } from '../../src/ports';
import { BrowserSkillFiles } from '../../src/adapters/browserSkillFiles.ts';

function snapshot(files: Record<string, string>, complete = true, rootId = 'root-a'): RootSnapshot {
  const directories = new Set(['']);
  for (const name of Object.keys(files)) { const parts = name.split('/'); for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join('/')); }
  return { root: { id: rootId, name: rootId, mode: 'directory', status: 'ready', lastScannedAt: null, error: null }, files: new Map(Object.entries(files).map(([key, value]) => [key, new Blob([value])])), directories: [...directories], complete, error: complete ? undefined : '目录路径不存在或权限已失效' };
}
const valid = '---\nid: real-id\nname: Real Skill\ndescription: A real local skill\nversion: 1.2.3\n---\n# Real Skill\n';

test('YAML 与普通 Markdown 均规范化；未知值不猜测', () => {
  const parsed = readSkillManifest(valid, 'folder');
  assert.equal(parsed.name, 'Real Skill'); assert.equal(parsed.version, '1.2.3'); assert.equal(parsed.author, null); assert.deepEqual(parsed.issues, []);
  const plain = readSkillManifest('# Plain\n\nA description.\n\n## 输入要求\n文本\n\n## 输出格式\nPNG', 'folder');
  assert.equal(plain.name, 'Plain'); assert.equal(plain.description, 'A description.'); assert.equal(plain.outputs[0].format, 'PNG');
});
test('缺字段、损坏 YAML、重复键、非法外部链接分别有明确结果', () => {
  assert.equal(readSkillManifest('', 'folder').invalid, true);
  assert.ok(readSkillManifest('plain text', 'folder').issues.includes('名称未声明，暂用目录名'));
  assert.equal(readSkillManifest('---\nname: [bad\n---\nbody', 'folder').invalid, true);
  assert.equal(readSkillManifest('---\nname: A\nname: B\n---\nbody', 'folder').invalid, true);
  assert.equal(safeRelativePath('../secret.png'), null); assert.equal(safeRelativePath('C:/secret.png'), null);
  assert.equal(safeRepository('javascript:alert(1)'), null); assert.equal(safeRepository('https://github.com/org/repo'), 'https://github.com/org/repo');
});
test('五类参数、默认值与非法范围标准化', () => {
  const parsed = readSkillManifest(`---\nname: Parameters\ndescription: test\nparameters:\n  strength: {type: range, label: 强度, min: 0, max: 100, default: 65}\n  mode: {type: select, options: [a, b], default: a}\n  enabled: {type: boolean, default: true}\n  count: {type: number, min: 1, max: 4, default: 2}\n  title: {type: text, default: Hello}\n---\n`, 'folder');
  assert.equal(parsed.parameters.length, 5);
  assert.deepEqual(normalizeParameters(parsed.parameters, { strength: 120, count: NaN, mode: 'bad', enabled: 'false' }), { strength: 100, mode: 'a', enabled: true, count: 2, title: 'Hello' });
  assert.ok(readSkillManifest('---\nname: A\ndescription: B\nparameters:\n  x: {type: range, min: 10, max: 0}\n---\n', 'folder').issues.length);
});
test('单个损坏 Skill 不影响正常目录，缺 SKILL.md 被发现', async () => {
  const result = await scanSkillSnapshots([snapshot({ 'good/SKILL.md': valid, 'bad/SKILL.md': '---\na: [broken\n---', 'missing/README.md': 'No skill', 'README.md': 'root container' })], [], 'manual');
  assert.equal(result.manifests.length, 3);
  assert.equal(result.manifests.find(item => item.id === 'real-id')?.runtime.status, 'ready');
  assert.equal(result.manifests.filter(item => item.runtime.status === 'invalid').length, 2);
});
test('同目录和跨根目录重复 ID，安装记录仍各自独立', async () => {
  const result = await scanSkillSnapshots([snapshot({ 'a/SKILL.md': valid, 'b/SKILL.md': valid })], [], 'manual');
  assert.equal(new Set(result.manifests.map(item => item.installation.id)).size, 2);
  assert.ok(result.manifests.every(item => item.runtime.issues.includes('重复 Skill ID')));
  const first = await scanSkillSnapshots([snapshot({ 'a/SKILL.md': valid })], [], 'manual');
  const added = await scanSkillSnapshots([snapshot({ 'b/SKILL.md': valid }, true, 'root-b')], first.manifests, 'manual');
  assert.ok(added.manifests.every(item => item.runtime.status === 'invalid'));
});
test('已删除 Skill 保留异常记录，根目录失效不误报删除', async () => {
  const original = await scanSkillSnapshots([snapshot({ 'good/SKILL.md': valid })], [], 'manual');
  const gone = await scanSkillSnapshots([snapshot({})], original.manifests, 'manual');
  assert.equal(gone.manifests[0].installation.installed, false);
  const inaccessible = await scanSkillSnapshots([snapshot({}, false)], original.manifests, 'manual');
  assert.equal(inaccessible.manifests[0].installation.installed, true);
  assert.equal(inaccessible.manifests[0].runtime.status, 'unavailable');
});
test('同根目录移动 Skill 保持身份、收藏与安装时间', async () => {
  const original = await scanSkillSnapshots([snapshot({ 'old/SKILL.md': valid })], [], 'manual');
  original.manifests[0].installation.favorite = true;
  const moved = await scanSkillSnapshots([snapshot({ 'new/SKILL.md': valid })], original.manifests, 'manual');
  assert.equal(moved.manifests.length, 1); assert.equal(moved.manifests[0].installation.id, original.manifests[0].installation.id);
  assert.equal(moved.manifests[0].installation.favorite, true); assert.equal(moved.manifests[0].installation.path, 'new');
});
test('必要文件依赖可检查，命令依赖保持未验证', async () => {
  const manifest = '---\nname: Dependencies\ndescription: test\ndependencies:\n - {name: assets/missing.png, type: file}\n - {name: python, type: command}\n---\n';
  const result = await scanSkillSnapshots([snapshot({ 's/SKILL.md': manifest })], [], 'manual');
  assert.equal(result.manifests[0].runtime.status, 'needs_configuration');
  assert.deepEqual(result.manifests[0].runtime.dependencies.map(item => item.status), ['missing', 'unverified']);
});
test('异常版本和不兼容声明被保留，没有假造更新信息', async () => {
  const result = await scanSkillSnapshots([snapshot({ 's/SKILL.md': '---\nname: Version\ndescription: test\nversion: nonsense\nruntime: {compatible: false}\n---\n' })], [], 'manual');
  assert.equal(result.manifests[0].runtime.status, 'incompatible');
  assert.ok(result.manifests[0].runtime.issues.includes('版本信息异常'));
  assert.equal(result.manifests[0].version.latest, null);
});
test('本地元数据可导入，缺失案例不会伪造图片', async () => {
  const result = await scanSkillSnapshots([snapshot({ 's/SKILL.md': valid + '\n', 's/.skill-canvas.json': '{"id":"metadata-id","favorite":true}' })], [], 'manual');
  assert.equal(result.manifests[0].id, 'metadata-id'); assert.equal(result.manifests[0].installation.favorite, true); assert.deepEqual(result.manifests[0].examples, []);
});
test('正式 Runner 状态 queued → running → completed，取消不再推进', () => {
  const task = mockRunner.createTask(defaultDraft, 'test', demoManifests[0], 'project');
  assert.equal(task.status, 'queued'); assert.equal(mockRunner.advance(task, task.startedAt + 1).status, 'running');
  assert.equal(mockRunner.advance(task, task.startedAt + task.duration).status, 'completed');
  assert.equal(mockRunner.advance({ ...task, status: 'cancelled' }, task.startedAt + task.duration).status, 'cancelled');
});

function memoryStorage(): StorageBridge {
  const data = new Map<string, unknown>();
  return {
    async get<T>(key: string) { return data.get(key) as T | undefined; },
    async set(key, value) { data.set(key, value); }, async remove(key) { data.delete(key); },
    async entries<T>(prefix: string) { return [...data.entries()].filter(([key]) => key.startsWith(prefix)) as [string, T][]; },
    async batch(changes) { for (const change of changes) if (change.remove) data.delete(change.key); else data.set(change.key, change.value); },
  };
}
test('目录适配器从持久化句柄递归读取，忽略依赖目录，重新授权无需预扫描', async () => {
  const storage = memoryStorage(), root = snapshot({}).root;
  let permission: PermissionState = 'prompt';
  const handle = {
    kind: 'directory', name: 'root',
    async queryPermission() { return permission; }, async requestPermission() { permission = 'granted'; return permission; },
    async *values() {
      yield { kind: 'directory', name: '.git', async *values() { throw new Error('必须跳过'); } };
      yield { kind: 'directory', name: 'local', async *values() { yield { kind: 'file', name: 'SKILL.md', async getFile() { return new File([valid], 'SKILL.md'); } }; } };
    },
  };
  await storage.set(`handle:${root.id}`, handle);
  const files = new BrowserSkillFiles(storage);
  await files.requestAccess(root);
  const result = await files.scanDirectories([root]);
  assert.equal(result[0].complete, true); assert.equal(result[0].files.size, 1);
  assert.equal(await result[0].files.get('local/SKILL.md')?.text(), valid);
});
test('目录适配器隔离权限拒绝与失效路径，不写入 Skill 文件', async () => {
  const storage = memoryStorage(), root = snapshot({}).root;
  await storage.set(`handle:${root.id}`, { async queryPermission() { return 'denied'; } });
  const files = new BrowserSkillFiles(storage);
  const denied = await files.scanDirectories([root]);
  assert.equal(denied[0].complete, false); assert.match(denied[0].error || '', /权限/);
  await storage.set(`handle:${root.id}`, { async queryPermission() { return 'granted'; }, async *values() { throw new Error('目录已移动或删除'); } });
  const missing = await new BrowserSkillFiles(storage).scanDirectories([root]);
  assert.equal(missing[0].complete, false); assert.match(missing[0].error || '', /移动或删除/);
});
test('目录快照显式要求重新导入，失效句柄不会误报成功', async () => {
  const files = new BrowserSkillFiles(memoryStorage()), root = snapshot({}).root;
  const result = await files.scanDirectories([{ ...root, mode: 'snapshot' }, root]);
  assert.ok(result.every(item => !item.complete)); assert.match(result[0].error || '', /重新导入/);
  assert.match(result[1].error || '', /句柄不存在/);
});
