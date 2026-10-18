import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, lstat, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseDocument } from 'yaml';
import { readSkillManifest } from '../../src/domain/manifest.ts';
import { replaceRecord } from './workspace.mjs';
import { GitHubSource, checkedFiles, hash, safeName, checkSkillReferences, githubSkillLocation } from './skillSources.mjs';
import {readSkillZip} from './skillZip.mjs';
import { batchForSource } from '../protocol/visualBatch.ts';
import { reviewedProfile } from '../protocol/reviewedSkills.ts';
import { reviewedPython } from './reviewedDependencies.mjs';

const now = () => new Date().toISOString();
const executable = /\.(sh|ps1|bat|cmd|exe|dll|com|msi|py|js|mjs|cjs|ts|wasm)$/i;
export function installationTranslations(value) {
  if(value===undefined)return undefined;
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(key=>!['zh-CN','en'].includes(key)))throw Error('展示翻译结构无效。');
  const result={};for(const language of ['zh-CN','en'])if(value[language]!==undefined){const entry=value[language];if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['name','description'].includes(key)))throw Error('展示翻译结构无效。');result[language]={};for(const key of ['name','description'])if(entry[key]!==undefined){if(typeof entry[key]!=='string'||entry[key].length>(key==='name'?100:1000))throw Error('展示名称最多 100 字，简介最多 1000 字。');if(entry[key].trim())result[language][key]=entry[key].trim();}}
  return result;
}
export class SkillRegistry {
  constructor(root, { github = new GitHubSource(), validate = async () => ({ ready: false, issue: 'Codex 尚未连接，无法验证。' }) } = {}) {
    this.root = path.resolve(root); this.github = github; this.validate = validate; this.records = new Map(); this.corruptRecords = new Map(); this.previews = new Map(); this.queue = Promise.resolve(); this.boot = this.load();
  }
  async load() {
    await mkdir(this.root, { recursive: true });
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^managed-[a-f0-9]{24}$/.test(entry.name)) continue;
      try {
        const saved = await readFile(path.join(this.root, entry.name, 'metadata/record.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (!saved) continue; // An interrupted validation never commits an installation record.
        const record = JSON.parse(saved);
        const manifest = record.versions?.[record.current]?.manifest;
        if (record.id !== entry.name || manifest?.id !== entry.name || !manifest.source?.path || !Array.isArray(manifest.runtime?.issues) || !Array.isArray(manifest.runtime?.dependencies) || !Array.isArray(manifest.inputs) || !Array.isArray(manifest.outputs) || !Array.isArray(manifest.parameters) || !Array.isArray(manifest.examples) || !manifest.installation || !Array.isArray(record.audit)) throw new Error('Skill 元数据身份或版本结构不匹配。');
        this.manifest(record); // Detect malformed records individually before publishing the catalog.
        this.records.set(record.id, record);
      } catch (error) { this.corruptRecords.set(entry.name, String(error.message || error)); }
    }
  }
  async serial(fn) { const run = this.queue.catch(() => {}).then(async () => { await this.boot; return fn(); }); this.queue = run; return run; }
  async save(record) {
    const directory = path.join(this.root, record.id, 'metadata'); await this.directory(directory);
    const temporary = path.join(directory, `${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(record, null, 2), { flag: 'wx' });
    await replaceRecord(temporary, path.join(directory, 'record.json')); this.records.set(record.id, structuredClone(record));
  }
  record(id) { if (this.corruptRecords.has(id)) throw new Error('Skill 元数据损坏，请恢复 metadata/record.json；原文件已保留。'); const value = this.records.get(id); if (!value) throw new Error('Skill 安装记录不存在。'); return structuredClone(value); }
  async directory(target) {
    const relative = path.relative(this.root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Skill 写入路径越界。');
    let cursor = this.root;
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Skill 根目录不得是符号链接。');
    for (const segment of relative.split(path.sep)) {
      cursor = path.join(cursor, segment); await mkdir(cursor).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const stat = await lstat(cursor); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Skill 目录包含链接或异常类型。');
    }
  }
  async list() {
    await this.boot;
    const invalid = [...this.corruptRecords].map(([id, error]) => ({ id, declaredId: null, name: id, description: '安装元数据损坏，原文件已保留。其它 Skill 可继续使用。', categories: [],
      source: { type: 'local', repository: null, author: null, path: path.join(this.root, id, 'metadata/record.json'), fingerprint: '' },
      version: { installed: null, latest: null, commit: null, updateStatus: 'unchecked' }, runtime: { status: 'invalid', compatible: false, dependencies: [], issues: [error] },
      inputs: [], outputs: [], parameters: [], examples: [], instructions: '', installation: { id, rootId: 'managed', path: path.join(this.root, id), installed: true, installedAt: '', updatedAt: '', updateStrategy: 'notify', favorite: false, validation: 'invalid', previousVersion: null, lastError: '请从备份恢复此 Skill 的元数据；不会覆盖损坏文件。' } }));
    return [...this.records.values()].map(record => this.manifest(record)).concat(invalid, await this.pendingCatalog());
  }
  async pendingCatalog() {
    const saved = await readFile(path.join(this.root, 'pending-catalog.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return '[]'; throw error; });
    let entries; try { entries = JSON.parse(saved); } catch { return []; }
    if (!Array.isArray(entries) || entries.length > 50) return [];
    return entries.flatMap(entry => {
      if (!entry || typeof entry.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(entry.name) || typeof entry.description !== 'string' || typeof entry.reason !== 'string') return [];
      const repo = entry.repository;
      // This is descriptive metadata, never a runnable installation or a Skill snapshot.
      if (typeof repo !== 'string' || !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(repo) || typeof entry.root !== 'string') return [];
      try { if (entry.root) safeName(entry.root); } catch { return []; }
      if ([...this.records.values()].some(record => !record.removed && record.versions[record.current].manifest.source.repository === repo && (record.versions[record.current].manifest.source.skillRoot || '') === entry.root)) return [];
      const id = `catalog-${hash(`${repo}/${entry.root}`).slice(0,24)}`;
      return [{ id, declaredId: entry.name, name: entry.name, description: entry.description.slice(0,2000), categories: entry.category ? [entry.category] : ['视觉创作'],
        source: { type: 'github', repository: repo, author: repo.split('/')[3], path: '', fingerprint: '', skillRoot: entry.root, license: null, licenseStatus: '待确认个人使用许可' },
        version: { installed: null, latest: null, commit: null, updateStatus: 'unchecked' }, runtime: { status: 'unavailable', compatible: null, dependencies: [], issues: [entry.reason] },
        inputs: [], outputs: [], parameters: [], examples: [], instructions: '',
        installation: { id, rootId: 'catalog-pending', path: '', installed: false, installedAt: '', updatedAt: '', favorite: false, validation: 'warning', updateStrategy: 'manual', previousVersion: null, executionValidated: false } }];
    });
  }
  manifest(record) {
    const manifest = structuredClone(record.versions[record.current].manifest);
    manifest.installation.executionValidated = record.versions[record.current].stable === true;
    manifest.version = { ...manifest.version, latest: record.latest?.version || null, latestCommit: record.latest?.commit || null, updateStatus: record.locked ? 'locked' : !record.latest ? 'unchecked' : record.latest.commit === manifest.version.commit ? 'current' : record.latest.commit === record.skipped ? 'skipped' : 'available', checkedAt: record.checkedAt || null };
    manifest.installation = { ...manifest.installation, installed: !record.removed, updatedAt: record.updatedAt, locked: record.locked, skippedVersion: record.skipped, previousVersion: record.previous ? record.versions[record.previous].manifest.version.installed : null, lastError: record.lastError || null };
    if(record.translations)manifest.installation.translations=structuredClone(record.translations);
    if (record.removed) manifest.runtime = { ...manifest.runtime, status: 'unavailable', issues: ['已移除；历史版本、Prompt 与结果保留。'] };
    return manifest;
  }
  async preview(input) {
    await this.boot;
    for (const [id, item] of this.previews) if (Date.now() - item.created > 30 * 60 * 1000) this.previews.delete(id);
    if (this.previews.size >= 10) throw new Error('待确认安装过多，请重启 Bridge 或等待预览过期。');
    if (input.type === 'github') {
      const location=githubSkillLocation(input.url);
      const snapshot = await this.github.inspect(location.url, input.ref || location.ref);
      if(location.root&&!snapshot.roots.includes(location.root))throw Error('该子目录未包含 SKILL.md，请选择检测到的 Skill 路径。');
      const token = randomUUID(); this.previews.set(token, { snapshot, created: Date.now() });
      return { token, source: snapshot.source, version: snapshot.version, commit: snapshot.commit, paths: location.root?[location.root]:snapshot.roots };
    }
    if (!['local','zip'].includes(input.type) || typeof input.folder !== 'string' || !input.folder.trim() || input.folder.length > 100) throw new Error('请选择本地 Skill 文件夹或 ZIP。');
    if(input.type==='local'&&!Array.isArray(input.files)||input.type==='zip'&&(typeof input.data!=='string'||input.data.length>90*1024*1024))throw Error('Skill 安装输入无效。');
    const files = input.type==='zip'?readSkillZip(Buffer.from(input.data,'base64')):checkedFiles(input.files.map(f => ({ path: f.path, bytes: Buffer.from(f.data, 'base64') })));
    const roots = files.filter(f => /(^|\/)SKILL\.md$/.test(f.path)).map(f => f.path.slice(0, -8).replace(/\/$/, ''));
    if (!roots.length) throw new Error('本地文件夹缺少 SKILL.md。');
    const license = files.find(f => /^(license|licence|copying)(\.(md|txt))?$/i.test(f.path));
    const token = randomUUID(), source = { type: 'local', repository: null, author: null, localPath: input.folder, license: license ? '本地许可证文件（未识别）' : null, licenseUrl: null, licenseStatus: license ? '无法确认' : '未检测到许可' };
    this.previews.set(token, { files, roots, source, created: Date.now() });
    return { token, source, version: '安装时从文件读取', commit: null, paths: roots };
  }
  async build(files, source, version, commit, id, installedAt) {
    checkedFiles(files);
    const markdown = files.find(f => f.path === 'SKILL.md')?.bytes.toString('utf8');
    if (!markdown || !/^---\r?\n/.test(markdown)) throw new Error('需要有效、带 frontmatter 的 SKILL.md。');
    const parsed = readSkillManifest(markdown, id);
    const header = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    const fields = header ? parseDocument(header).toJS({ maxAliasCount: 30 }) : null;
    if (typeof fields?.name !== 'string' || !fields.name.trim() || typeof fields?.description !== 'string' || !fields.description.trim()) throw new Error('Manifest frontmatter 必须声明 name 和 description。');
    if (parsed.invalid || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(parsed.name) || parsed.description === '未声明') throw new Error('Skill Manifest 无效，名称、描述或 YAML 不符合要求。');
    safeName(parsed.name);
    if (parsed.name.toLowerCase() === 'imagegen') throw new Error('imagegen 是内置 Skill 保留名称，不能通过第三方安装覆盖。');
    const fileNames = new Set(files.map(f => f.path));
    checkSkillReferences(markdown, fileNames);
    const bundle = hash(JSON.stringify({ files: files.map(f => `${f.path}:${hash(f.bytes)}`).sort(), commit: commit || null, version: version || parsed.version || null }));
    const directory = path.join(this.root, id, 'versions', bundle, parsed.name);
    for (const file of files) {
      const target = path.join(directory, file.path); await this.directory(path.dirname(target));
      try { await writeFile(target, file.bytes, { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST' || (await lstat(target)).isSymbolicLink() || hash(await readFile(target)) !== hash(file.bytes)) throw new Error('不可变 Skill 文件已存在但内容不一致。'); }
    }
    const skillPath = path.join(directory, 'SKILL.md');
    const dependencies = parsed.dependencies.map(d => ({ ...d, status: d.type === 'file' ? fileNames.has(safeName(d.name)) ? 'available' : 'missing' : 'unverified' }));
    const issues = [...parsed.issues];
    const sidecar = files.find(f => f.path === 'SKILL.json');
    if (sidecar) {
      let value; try { value = JSON.parse(sidecar.bytes.toString('utf8')); } catch { throw new Error('SKILL.json 无法解析。'); }
      if (value.dependencies?.tools?.length) issues.push('SKILL.json 声明外部工具依赖，须人工配置验证。');
    }
    if (files.some(f => executable.test(f.path))) issues.push('包含脚本或可执行资源：不会运行，须人工核对依赖。');
    if (dependencies.some(d => d.required && d.status !== 'available')) issues.push('外部依赖尚未满足或未经验证。');
    // Resource hashes, not only SKILL.md, define an immutable runnable version.
    const validation = await this.validate(skillPath, parsed.name).catch(error => ({ ready: false, issue: error.message }));
    if (!validation.ready) issues.push(validation.issue || 'Codex 或 ImageGen 尚不可用。');
    const ready = !issues.length && parsed.compatible !== false;
    const manifest = { id, declaredId: parsed.declaredId || parsed.name, name: parsed.name, description: parsed.description, categories: parsed.categories.length ? parsed.categories : ['视觉创作'],
      source: { ...source, author: source.author || parsed.author, path: skillPath, fingerprint: hash(markdown) },
      version: { installed: version || parsed.version || `sha256:${bundle.slice(0, 12)}`, commit: commit || null, latest: null, updateStatus: 'unchecked', bundle },
      runtime: { status: parsed.compatible === false ? 'incompatible' : ready ? 'ready' : 'needs_configuration', compatible: validation.ready, dependencies, issues },
      inputs: parsed.inputs, outputs: parsed.outputs.length ? parsed.outputs : [{ format: 'PNG', description: 'Skill Canvas 原图回传' }], parameters: parsed.parameters, examples: [], instructions: markdown,
      installation: { id, rootId: 'managed', path: skillPath, installed: true, installedAt: installedAt || now(), updatedAt: now(), updateStrategy: 'notify', favorite: false, validation: ready ? 'valid' : 'warning', previousVersion: null } };
    const selected = batchForSource(source.repository, commit, source.skillRoot);
    if (selected && selected.name === parsed.name) {
      manifest.categories = [selected.category]; manifest.parameters = selected.parameters;
      manifest.inputs = [{ id: 'prompt', label: '创作要求', type: '文本', required: true }, { id: 'references', label: '参考图（可选）', type: '图片', required: false }];
      manifest.examples = selected.examples.map((example, index) => {
        const relative = source.skillRoot ? `assets/showcase/${example.path.split('/').at(-1)}` : example.path;
        const asset = files.find(file => file.path === relative);
        if (!asset) throw new Error(`仓库案例缺失：${relative}`);
        const mime = relative.endsWith('.webp') ? 'image/webp' : /\.jpe?g$/i.test(relative) ? 'image/jpeg' : 'image/png';
        if (!(mime === 'image/png' && asset.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || mime === 'image/jpeg' && asset.bytes[0] === 255 && asset.bytes[1] === 216 || mime === 'image/webp' && asset.bytes.subarray(0,4).toString() === 'RIFF' && asset.bytes.subarray(8,12).toString() === 'WEBP')) throw new Error('仓库案例图像签名无效。');
        return { id: `repository-${index}`, label: example.label, imageRef: `data:${mime};base64,${asset.bytes.toString('base64')}`, beforeRef: null, verified: false, source: 'declared', sha256: hash(asset.bytes), sourceUrl: `${source.repository}/blob/${commit}/${example.path}`, skillCommit: commit, recordedAt: now() };
      });
    }
    return { manifest, bundle, files: files.map(f => ({ path: f.path, hash: hash(f.bytes) })), stable: false };
  }
  async review(input) { return this.serial(async () => {
    const preview = this.previews.get(input.token);
    if (!preview || Date.now() - preview.created > 1800000) throw new Error('安装摘要已过期。');
    if (!(preview.snapshot?.roots || preview.roots).includes(input.path)) throw new Error('请选择检测到的 Skill 目录。');
    const source = preview.snapshot?.source || preview.source, root = input.path;
    const files = preview.snapshot ? await this.github.files(preview.snapshot, root) : preview.files.filter(f => !root || f.path.startsWith(`${root}/`)).map(f => ({ ...f, path: root ? f.path.slice(root.length + 1) : f.path }));
    const id = `managed-${hash(`${source.repository || `local:${source.localPath}`}/${root}`).slice(0, 24)}`;
    const built = await this.build(files, { ...source, skillRoot: root }, preview.snapshot?.version, preview.snapshot?.commit, id);
    preview.review = { path: root, files, built };
    return built.manifest;
  }); }
  async install(input) { return this.serial(async () => {
    const translations=installationTranslations(input.translations);
    const preview = this.previews.get(input.token);
    if (!preview || Date.now() - preview.created > 30 * 60 * 1000) throw new Error('安装摘要已过期，请重新预览。');
    const source = preview.snapshot?.source || preview.source;
    if (source.type === 'github' && input.trustAuthor !== true) throw new Error('请确认此仓库是原作者来源，而非转载聚合。');
    if (source.type !== 'local' && source.licenseStatus !== '明确许可') throw new Error('未检测到明确许可证，不提供 GitHub 推荐安装；如有个人使用权限可手动导入本地文件夹。');
    const root = input.path;
    if (!(preview.snapshot?.roots || preview.roots).includes(root)) throw new Error('请明确选择一个 Skill 目录。');
    const files = preview.review?.path === root ? preview.review.files : preview.snapshot ? await this.github.files(preview.snapshot, root) : preview.files.filter(f => !root || f.path.startsWith(`${root}/`)).map(f => ({ ...f, path: root ? f.path.slice(root.length + 1) : f.path }));
    const id = `managed-${hash(`${source.repository || `local:${source.localPath}`}/${root}`).slice(0, 24)}`;
    const old = this.records.get(id);
    if (this.corruptRecords.has(id)) throw new Error('同 ID 的安装元数据损坏，须先恢复原记录，不能覆盖。');
    if (old && !old.removed) throw new Error('Skill ID 已安装；请使用更新，不会覆盖现有 Skill。');
    const built = await this.build(files, { ...source, skillRoot: root }, preview.snapshot?.version, preview.snapshot?.commit, id);
    if ([...this.records.values()].some(r => !r.removed && r.id !== id && (r.versions[r.current].manifest.declaredId === built.manifest.declaredId || r.versions[r.current].manifest.name === built.manifest.name))) throw new Error('Skill 名称或声明 ID 已存在，拒绝覆盖或制造歧义。');
    const record = { id, current: built.bundle, previous: null, versions: { ...old?.versions, [built.bundle]: built }, locked: false, skipped: null, removed: false, updatedAt: now(), audit: [...old?.audit || [], { at: now(), action: 'install', version: built.bundle }] };
    record.translations=translations||old?.translations;
    await this.save(record); this.previews.delete(input.token); return this.manifest(record);
  }); }
  async check(id) { return this.serial(async () => {
    const record = this.record(id), manifest = this.manifest(record);
    if (record.removed) throw new Error('Skill 已移除。');
    try {
      if (!manifest.source.repository) throw new Error('本地快照需重新选择文件夹来检查更新。');
      const snapshot = await this.github.inspect(manifest.source.repository);
      record.latest = { version: snapshot.version, commit: snapshot.commit }; record.checkedAt = now(); record.lastError = null;
      await this.save(record); return this.manifest(record);
    } catch (error) { record.latest = null; record.lastError = error.message; await this.save(record); throw error; }
  }); }
  async changes(id){return this.serial(async()=>{
    const record=this.record(id),current=record.versions[record.current],source=current.manifest.source;
    if(!source.repository)throw Error('本地快照需重新选择文件夹来检查更新。');
    const snapshot=await this.github.inspect(source.repository),files=await this.github.files(snapshot,source.skillRoot),old=new Map(current.files.map(f=>[f.path,f.hash])),next=new Map(files.map(f=>[f.path,hash(f.bytes)]));
    const added=[...next.keys()].filter(key=>!old.has(key)),removed=[...old.keys()].filter(key=>!next.has(key)),changed=[...next.keys()].filter(key=>old.has(key)&&old.get(key)!==next.get(key));
    return {from:current.manifest.version.commit,to:snapshot.commit,version:snapshot.version,added,removed,changed,licenseStatus:snapshot.source.licenseStatus};
  });}
  async update(id, input = {}) { return this.serial(async () => {
    const record = this.record(id), original = structuredClone(record), current = record.versions[record.current].manifest;
    if (record.removed || record.locked) throw new Error('已移除或锁定版本，不能更新。');
    try {
      let files, source = current.source, version, commit;
      if (source.repository) {
        const snapshot = await this.github.inspect(source.repository);
        if (snapshot.source.licenseStatus !== '明确许可') throw new Error('新版本许可证无法确认，未安装。');
        if (snapshot.commit === current.version.commit) {
          record.latest = { version: snapshot.version, commit: snapshot.commit }; record.checkedAt = now(); record.lastError = null;
          await this.save(record); return this.manifest(record);
        }
        files = await this.github.files(snapshot, source.skillRoot); source = { ...snapshot.source, skillRoot: source.skillRoot }; version = snapshot.version; commit = snapshot.commit;
      } else {
        const preview = this.previews.get(input.token);
        if (!preview?.files || Date.now() - preview.created > 1800000 || !preview.roots.includes(input.path)) throw new Error('请重新选择本地文件夹并预览。');
        files = preview.files.filter(f => !input.path || f.path.startsWith(`${input.path}/`)).map(f => ({ ...f, path: input.path ? f.path.slice(input.path.length + 1) : f.path }));
        source = { ...source, ...preview.source, skillRoot: input.path };
      }
      const built = await this.build(files, source, version, commit, id, current.installation.installedAt);
      if (built.manifest.declaredId !== current.declaredId || built.manifest.name !== current.name) throw new Error('新版本名称或 ID 改变，须作为新 Skill 安装。');
      if (built.manifest.runtime.status !== 'ready') throw new Error(built.manifest.runtime.issues.join('；') || '新版本暂不兼容');
      if (built.bundle === record.current) return this.manifest(record);
      record.previous = record.versions[record.current].stable || !record.previous ? record.current : record.previous;
      record.current = built.bundle; record.versions[built.bundle] = built; record.latest = commit ? { version, commit } : null; record.lastError = null; record.updatedAt = now();
      record.audit.push({ at: now(), action: 'update', version: built.bundle }); await this.save(record); if (input.token) this.previews.delete(input.token); return this.manifest(record);
    } catch (error) { original.lastError = `更新失败，已保留原版本：${error.message}`; original.audit.push({ at: now(), action: 'update_failed', error: error.message }); await this.save(original); throw new Error(original.lastError); }
  }); }
  async action(id, action, input = {}) { return this.serial(async () => {
    const record = this.record(id);
    if (action === 'lock') record.locked = input.locked === true;
    else if (action === 'skip') { if (!record.latest) throw new Error('请先检查更新。'); record.skipped = record.latest.commit; }
    else if (action === 'rollback') {
      if (!record.previous) throw new Error('没有可回滚的上一版本。');
      await this.verify(record, record.previous); record.current = record.previous; record.previous = null; record.lastError = null;
    } else if (action === 'remove') { if (input.confirm !== true) throw new Error('移除需要二次确认。'); record.removed = true; }
    else throw new Error('未知 Skill 操作。');
    record.updatedAt = now(); record.audit.push({ at: now(), action, version: record.current }); await this.save(record); return this.manifest(record);
  }); }
  async verify(record, bundle) {
    const version = record.versions[bundle]; if (!version) throw new Error('项目绑定的 Skill 版本不存在。');
    const directory = path.dirname(version.manifest.source.path), root = await realpath(this.root);
    const realDirectory = await realpath(directory);
    if (!realDirectory.startsWith(`${root}${path.sep}`)) throw new Error('Skill 目录越界。');
    const actualFiles = [];
    const walk = async (directory, prefix = '') => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relative = prefix + entry.name, target = path.join(directory, entry.name), info = await lstat(target);
        if (info.isSymbolicLink()) throw new Error('不可变 Skill 中发现符号链接。');
        if (info.isDirectory()) await walk(target, relative + '/');
        else if (info.isFile()) actualFiles.push(relative);
        else throw new Error('不可变 Skill 中发现异常文件。');
      }
    };
    await walk(directory);
    if (JSON.stringify(actualFiles.sort()) !== JSON.stringify(version.files.map(file => file.path).sort())) throw new Error('Skill 文件集合被修改，拒绝执行。');
    for (const file of version.files) {
      const target = path.join(directory, safeName(file.path)), actual = await realpath(target);
      if (!actual.startsWith(`${realDirectory}${path.sep}`) || (await lstat(target)).isSymbolicLink() || hash(await readFile(target)) !== file.hash) throw new Error('Skill 文件缺失、损坏或被修改。');
    }
    return version;
  }
  async resolve(skill) {
    await this.boot; const record = this.record(skill.id);
    if (record.removed) throw new Error('Skill 已移除；历史结果仍可查看，请重新安装后再生成。');
    const version = await this.verify(record, skill.bundle);
    if (version.review) {
      const profile = reviewedProfile(version.manifest);
      if (!profile || version.review.bundle !== profile.bundle) throw new Error('脚本审查不适用于此 Skill 版本，请重新配置。');
      if (profile.python) await reviewedPython();
    }
    if (version.manifest.runtime.status !== 'ready') throw new Error('Skill 需要配置，不能执行第三方脚本或未满足的依赖。');
    if (version.manifest.source.fingerprint !== skill.fingerprint || version.manifest.version.commit !== (skill.commit || null) || (skill.name && version.manifest.name !== skill.name) || (skill.version && version.manifest.version.installed !== skill.version)) throw new Error('Skill 版本身份不匹配。');
    return version.manifest.source.path;
  }
  async revalidate(id) { return this.serial(async()=>{
    const record=this.record(id);if(record.removed)throw Error('Skill 已移除，不能重新验证。');
    const version=await this.verify(record,record.current),manifest=version.manifest;
    const files=await Promise.all(version.files.map(async file=>({path:file.path,bytes:await readFile(path.join(path.dirname(manifest.source.path),file.path))})));
    const markdown=files.find(f=>f.path==='SKILL.md').bytes.toString('utf8'),parsed=readSkillManifest(markdown,id);
    const tag=manifest.version.installed?.startsWith('sha256:')?null:manifest.version.installed;
    const bundle=hash(JSON.stringify({files:files.map(f=>`${f.path}:${hash(f.bytes)}`).sort(),commit:manifest.version.commit||null,version:tag||parsed.version||null}));
    if(bundle!==record.current)throw Error('版本身份校验失败，未改变安装记录。');
    const checked=await this.build(files,manifest.source,tag,manifest.version.commit,id,manifest.installation.installedAt);
    // Re-run all structural/dependency gates. This never grants a script exception.
    manifest.runtime=checked.manifest.runtime;manifest.installation.validation=checked.manifest.installation.validation;
    record.updatedAt=now();record.audit.push({at:now(),action:'revalidate',version:record.current,status:manifest.runtime.status});
    await this.save(record);return this.manifest(record);
  }); }
  async configure(id) { return this.serial(async () => {
    const record = this.record(id);
    if (record.removed) throw new Error('Skill 已移除，不能配置。');
    const version = await this.verify(record, record.current), manifest = version.manifest;
    const profile = reviewedProfile(manifest);
    if (!profile) {
      const reason = manifest.name === 'travel-photo-abstraction'
        ? '旅行抽象需要严格像素保真的 Python 拼版流程；现有原生单张输出契约尚未适配，不能通过重复安装解决。原文件已保留。'
        : '此版本尚未完成专项脚本审查，不能自动解除配置限制。';
      if (manifest.name === 'travel-photo-abstraction') {
        manifest.runtime.issues = [...new Set([...manifest.runtime.issues, reason])];
        record.audit.push({ at: now(), action: 'configuration_blocked', version: record.current, reason });
        record.updatedAt = now(); await this.save(record);
      }
      throw new Error(reason);
    }
    const blocker = '包含脚本或可执行资源：不会运行，须人工核对依赖。';
    if (manifest.runtime.issues.some(issue => issue !== blocker)) throw new Error('存在其它未解决的配置问题，拒绝解除限制。');
    const validation = await this.validate(manifest.source.path, manifest.name);
    if (!validation.ready) throw new Error(validation.issue || 'Codex 尚未识别此 Skill。');
    const python = profile.python ? await reviewedPython() : undefined;
    manifest.runtime = { ...manifest.runtime, status: 'ready', compatible: true, issues: [], review: profile.bundle, ...(python ? { python } : {}) };
    manifest.installation.validation = 'valid';
    version.review = { bundle: profile.bundle, at: now(), mode: 'native-imagegen', ...(python ? { python } : {}) };
    record.updatedAt = now(); record.audit.push({ at: now(), action: 'configure', version: record.current, mode: 'native-imagegen', review: profile.bundle });
    await this.save(record); return this.manifest(record);
  }); }
  async execution(id, bundle, success, reason) { return this.serial(async () => {
    const record = this.record(id); if (!record.versions[bundle]) return;
    if (success) record.versions[bundle].stable = true;
    else if (record.current === bundle && record.previous) {
      await this.verify(record, record.previous); record.current = record.previous; record.previous = null;
      record.lastError = `新版本运行失败，已自动恢复上一版本：${reason}`;
      record.audit.push({ at: now(), action: 'runtime_rollback', failed: bundle, error: reason });
    }
    await this.save(record);
  }); }
}
