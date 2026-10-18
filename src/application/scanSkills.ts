import type { RootSnapshot, StorageMutation } from '../ports';
import type { SkillManifest, UpdateStrategy } from '../domain/skill';
import { declaredExample, object, readSkillManifest, safeRelativePath } from '../domain/manifest.ts';

const fingerprint = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('');
const leaf = (path: string) => path.split('/').at(-1) || '';
const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const join = (path: string, file: string) => [path, file].filter(Boolean).join('/');
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export async function scanSkillSnapshots(snapshots: RootSnapshot[], previous: SkillManifest[], strategy: UpdateStrategy) {
  const now = new Date().toISOString(), assets: StorageMutation[] = [], found: SkillManifest[] = [];
  const coveredRoots = new Set(snapshots.map(snapshot => snapshot.root.id));
  for (const snapshot of snapshots) {
    const skillFiles = [...snapshot.files.keys()].filter(path => leaf(path).toLowerCase() === 'skill.md');
    const skillPaths = skillFiles.map(parent);
    const candidates = new Set(skillPaths);
    for (const directory of snapshot.directories) {
      if (directory.split('/').some(part => ['assets', 'scripts', 'references', 'node_modules', '.git'].includes(part))) continue;
      if (skillPaths.some(skillPath => skillPath === '' || directory === skillPath || directory.startsWith(`${skillPath}/`))) continue;
      const hasChildren = snapshot.directories.some(path => directory ? path.startsWith(`${directory}/`) : path !== '');
      if (!hasChildren && (directory !== '' || [...snapshot.files.keys()].some(path => parent(path) === directory))) candidates.add(directory);
    }
    for (const path of candidates) {
      const filename = skillFiles.find(file => parent(file) === path);
      const file = filename ? snapshot.files.get(filename) : undefined;
      let markdown = '', readError = '', local: Record<string, unknown> = {};
      try {
        if (!file) readError = '缺少 SKILL.md';
        else if (file.size > 1024 * 1024) readError = 'SKILL.md 超过 1 MB，未解析';
        else markdown = await file.text();
      } catch { readError = 'SKILL.md 无法读取'; }
      let metadataError = '';
      const sidecar = snapshot.files.get(join(path, '.skill-canvas.json'));
      if (sidecar) {
        try { if (sidecar.size > 65536) throw new Error(); local = object(JSON.parse(await sidecar.text())); }
        catch { metadataError = '.skill-canvas.json 无法解析，已忽略'; }
      }
      const parsed = readSkillManifest(markdown, leaf(path) || snapshot.root.name, local);
      const hash = await fingerprint(markdown || `${snapshot.root.id}/${path}`);
      const samePath = previous.find(item => item.installation.rootId === snapshot.root.id && item.installation.path === path);
      const sameIdentity = previous.filter(item => item.installation.rootId === snapshot.root.id && !candidates.has(item.installation.path) && (parsed.declaredId ? item.id === parsed.declaredId : item.source.fingerprint === hash));
      const known = samePath || (sameIdentity.length === 1 ? sameIdentity[0] : undefined);
      const id = parsed.declaredId || known?.id || `local-${hash.slice(0, 16)}`;
      const installationId = known?.installation.id || crypto.randomUUID();
      const issues = [...parsed.issues, ...[readError, metadataError].filter(Boolean)];
      const dependencies = parsed.dependencies.map(dependency => {
        if (dependency.type !== 'file') return dependency;
        const relative = safeRelativePath(dependency.name);
        return { ...dependency, status: relative && snapshot.files.has(join(path, relative)) ? 'available' as const : 'missing' as const };
      });
      for (const dependency of dependencies.filter(item => item.required && item.status !== 'available')) issues.push(dependency.status === 'missing' ? `缺少依赖：${dependency.name}` : `需要验证依赖：${dependency.name}（Web 无法检查命令环境）`);
      const examples: SkillManifest['examples'] = [];
      const importImage = (relative: string | null, suffix: string) => {
        if (!relative) return null;
        const image = snapshot.files.get(join(path, relative));
        if (!image || !/\.(png|jpe?g|webp)$/i.test(relative) || image.size > 8 * 1024 * 1024) { issues.push(`案例文件不可用：${relative}`); return null; }
        const key = `asset:example:${installationId}:${suffix}`;
        assets.push({ key, value: image }); return key;
      };
      parsed.examplePaths.slice(0, 8).forEach((example, index) => {
        const image = importImage(example.image, `${index}-after`), before = importImage(example.before, `${index}-before`);
        if (image) examples.push(declaredExample(`${index}`, example.label, image, before));
      });
      const status = parsed.invalid || readError ? 'invalid' : parsed.compatible === false ? 'incompatible' : issues.some(issue => ['版本信息异常', 'Skill ID 格式异常'].includes(issue)) ? 'invalid' : issues.length ? 'needs_configuration' : 'ready';
      found.push({
        id, declaredId: parsed.declaredId, name: parsed.name, description: parsed.description, categories: parsed.categories.length ? parsed.categories : ['未分类'],
        source: { type: 'local', repository: parsed.repository, author: parsed.author, path: join(snapshot.root.name, path), fingerprint: hash },
        version: { installed: parsed.version, latest: null, commit: parsed.commit, updateStatus: 'unchecked' },
        runtime: { status, compatible: parsed.compatible, dependencies, issues }, inputs: parsed.inputs, outputs: parsed.outputs, parameters: parsed.parameters, examples, instructions: parsed.instructions,
        installation: { id: installationId, rootId: snapshot.root.id, path, installed: !!file, installedAt: known?.installation.installedAt || timestamp(local.installedAt) || now, updatedAt: now, updateStrategy: known?.installation.updateStrategy || (local.updateStrategy === 'manual' || local.updateStrategy === 'notify' ? local.updateStrategy : strategy), favorite: known?.installation.favorite ?? local.favorite === true, validation: status === 'invalid' ? 'invalid' : issues.length ? 'warning' : 'valid', previousVersion: known?.installation.previousVersion || (typeof local.previousVersion === 'string' ? local.previousVersion : null) },
      });
    }
  }
  const preserved = previous.filter(item => !found.some(current => current.installation.id === item.installation.id)).map(item => {
    if (!coveredRoots.has(item.installation.rootId)) return item;
    const snapshot = snapshots.find(root => root.root.id === item.installation.rootId)!;
    if (!snapshot.complete) return { ...item, runtime: { ...item.runtime, status: 'unavailable' as const, issues: [snapshot.error || '目录未完整读取，保留上次记录'] } };
    return { ...item, installation: { ...item.installation, installed: false, updatedAt: now }, runtime: { ...item.runtime, status: 'unavailable' as const, issues: ['Skill 已删除或路径发生变化，请重新扫描或重新选择目录'] } };
  });
  const manifests = [...found, ...preserved];
  const groups = new Map<string, SkillManifest[]>();
  for (const item of manifests.filter(item => item.installation.installed && item.runtime.status !== 'unavailable')) groups.set(item.id, [...groups.get(item.id) || [], item]);
  for (const group of groups.values()) if (group.length > 1) for (const item of group) { item.runtime.status = 'invalid'; item.runtime.issues = [...item.runtime.issues.filter(issue => issue !== '重复 Skill ID'), '重复 Skill ID']; item.installation.validation = 'invalid'; }
  return { manifests, assets, roots: snapshots.map(snapshot => ({ ...snapshot.root, status: snapshot.complete ? 'ready' as const : snapshot.error?.includes('权限') ? 'permission_required' as const : 'error' as const, lastScannedAt: snapshot.complete ? now : snapshot.root.lastScannedAt, error: snapshot.error || null })) };
}
