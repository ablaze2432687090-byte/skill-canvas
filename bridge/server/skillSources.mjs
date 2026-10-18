import { createHash } from 'node:crypto';
import { batchForSource } from '../protocol/visualBatch.ts';

export const hash = data => createHash('sha256').update(data).digest('hex');
// Reviewed image-style skills can contain dozens of full-resolution calibration images.
// Keep a bounded bundle cap without dropping required upstream resources.
export const MAX_SKILL_BYTES = 64 * 1024 * 1024;
export function checkSkillReferences(markdown, fileNames) {
  for (const match of markdown.matchAll(/`((?:references|assets|scripts)\/[^`\s]+\.[a-z0-9]+)`/gi)) {
    const file = match[1];
    if (/<[^/<>]+>/.test(file)) {
      safeName(file.replace(/<[^/<>]+>/g, 'template'));
      const pattern = file.split(/(<[^/<>]+>)/).map(part => /^<.*>$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
      if (![...fileNames].some(name => new RegExp(`^${pattern}$`).test(name))) throw new Error(`Skill 模板引用没有可选文件：${file}`);
    } else if (!fileNames.has(safeName(file))) throw new Error(`Skill 引用的文件缺失：${file}`);
  }
}
export function safeName(value) {
  if (typeof value !== 'string' || value.length > 240 || value.includes('\\') || value.split('/').some(p => !p || p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p) || ['.git', '.codex', '.agents'].includes(p.toLowerCase()))) throw new Error('异常路径：拒绝安装。');
  return value;
}
export function checkedFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > 500) throw new Error('Skill 文件数量须为 1–500。');
  let total = 0; const names = new Set();
  for (const file of files) {
    safeName(file.path); const name = file.path.toLowerCase();
    if (names.has(name)) throw new Error('重复文件路径（含大小写冲突）。'); names.add(name);
    if (!Buffer.isBuffer(file.bytes) || file.bytes.length > 8 * 1024 * 1024) throw new Error('单文件超过 8 MB。');
    total += file.bytes.length;
  }
  if (total > MAX_SKILL_BYTES) throw new Error('Skill 超过 64 MB。');
  for (const name of names) { const parts = name.split('/'); parts.pop(); while (parts.length) { if (names.has(parts.join('/'))) throw new Error('文件与目录路径冲突。'); parts.pop(); } }
  return files;
}
export function repository(value) {
  let url; try { url = new URL(value); } catch { throw new Error('请输入公开 GitHub 仓库 HTTPS URL。'); }
  const match = url.pathname.match(/^\/([\w-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !match) throw new Error('仅支持 https://github.com/作者/仓库，不接受镜像、压缩包或任意下载地址。');
  return `${match[1]}/${match[2]}`;
}
export function githubSkillLocation(value) {
  let url;try{url=new URL(value);}catch{throw Error('请输入公开 GitHub 仓库 HTTPS URL。');}
  const match=url.pathname.match(/^\/([\w-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.username||url.password||url.search||url.hash||!match)throw Error('仅支持 GitHub 仓库或 tree 子目录 HTTPS 地址。');
  const root=match[4]?decodeURIComponent(match[4]):undefined;if(root)safeName(root);
  return {url:`https://github.com/${match[1]}/${match[2]}`,ref:match[3]?decodeURIComponent(match[3]):undefined,root};
}
export class GitHubSource {
  constructor(fetcher = fetch) { this.fetcher = fetcher; }
  async request(url, { optional = false, json = true } = {}) {
    const response = await this.fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(25000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Skill-Canvas-Local' } });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${response.status}：仓库不可用、网络失败或请求限流，请稍后重试。`);
    const chunks = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 8 * 1024 * 1024) throw new Error('GitHub 响应超过安全限制。'); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks); return json ? JSON.parse(bytes.toString('utf8')) : bytes;
  }
  api(repo, suffix = '') { return this.request(`https://api.github.com/repos/${repo}${suffix}`); }
  async inspect(url, ref) {
    const repo = repository(url), info = await this.api(repo);
    if (info.private || info.fork || info.mirror_url || info.full_name.toLowerCase() !== repo.toLowerCase()) throw new Error('只接受原作者公开仓库；拒绝 fork、镜像或重定向来源。');
    let release = null, tag = null;
    if (!ref) {
      release = await this.request(`https://api.github.com/repos/${repo}/releases/latest`, { optional: true });
      if (!release) tag = (await this.api(repo, '/tags?per_page=1'))[0];
    }
    const reference = ref || release?.tag_name || tag?.name || info.default_branch;
    if (typeof reference !== 'string' || reference.length > 200) throw new Error('版本引用无效。');
    const commit = (await this.api(repo, `/commits/${encodeURIComponent(reference)}`)).sha;
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('GitHub commit 无效。');
    const tree = await this.api(repo, `/git/trees/${commit}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree) || tree.tree.length > 15000) throw new Error('仓库目录过大，请使用独立 Skill 仓库。');
    const roots = tree.tree.filter(f => f.type === 'blob' && /(^|\/)SKILL\.md$/.test(f.path)).map(f => f.path.slice(0, -8).replace(/\/$/, ''));
    if (!roots.length || roots.length > 100) throw new Error('未找到 SKILL.md，或 Skill 数量过多。');
    const licenseFile = tree.tree.find(f => f.type === 'blob' && /^(license|licence|copying)(\.(md|txt))?$/i.test(f.path));
    const licenseAtCommit = licenseFile ? await this.request(`https://api.github.com/repos/${repo}/license?ref=${commit}`, { optional: true }) : null;
    const licenseId = licenseAtCommit?.license?.spdx_id;
    const licenseIdentified = licenseId && licenseId !== 'NOASSERTION' && licenseAtCommit?.content && licenseAtCommit.path === licenseFile?.path;
    return { repo, tree: tree.tree, roots, version: ref || release?.tag_name || tag?.name || `commit:${commit.slice(0, 12)}`, commit,
      source: { type: repo.toLowerCase().startsWith('openai/') ? 'official' : 'github', repository: `https://github.com/${repo}`, author: info.owner.login, defaultBranch: info.default_branch,
        releaseUrl: release?.html_url || null, license: licenseIdentified ? licenseId : licenseFile ? '许可证文件（未识别）' : null,
        licenseUrl: licenseFile ? `https://github.com/${repo}/blob/${commit}/${licenseFile.path}` : null, licenseStatus: licenseIdentified ? '明确许可' : licenseFile ? '无法确认' : '未检测到许可' } };
  }
  async files(snapshot, root) {
    if (!snapshot.roots.includes(root)) throw new Error('请选择检测到的 Skill 路径。');
    const prefix = root ? `${root}/` : '';
    const entries = snapshot.tree.filter(f => f.path.startsWith(prefix) && f.type !== 'tree');
    const selected = batchForSource(snapshot.source.repository, snapshot.commit, root);
    const additions = selected?.examples.filter(example => !example.path.startsWith(prefix)).map(example => ({ ...snapshot.tree.find(entry => entry.path === example.path), installedPath: `assets/showcase/${example.path.split('/').at(-1)}` })) || [];
    if (root && !entries.some(entry => /^(LICENSE|LICENCE|COPYING)(\.(md|txt))?$/i.test(entry.path.slice(prefix.length)))) {
      const license = snapshot.tree.find(entry => /^(LICENSE|LICENCE|COPYING)(\.(md|txt))?$/i.test(entry.path));
      if (license) additions.push({ ...license, installedPath: license.path });
    }
    entries.push(...additions);
    if (entries.length > 500 || entries.reduce((sum, f) => sum + (f.size || 0), 0) > MAX_SKILL_BYTES) throw new Error('Skill 文件超过安装限制。');
    const files = [];
    for (const entry of entries) {
      if (!['100644', '100755'].includes(entry.mode) || entry.type !== 'blob') throw new Error('不安装符号链接或 Git 子模块。');
      const relative = safeName(entry.installedPath || entry.path.slice(prefix.length));
      const bytes = await this.request(`https://raw.githubusercontent.com/${snapshot.repo}/${snapshot.commit}/${entry.path.split('/').map(encodeURIComponent).join('/')}`, { json: false });
      const gitHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (gitHash !== entry.sha) throw new Error('下载文件与 commit 中的 Git blob Hash 不一致。');
      files.push({ path: relative, bytes });
    }
    return checkedFiles(files);
  }
}
