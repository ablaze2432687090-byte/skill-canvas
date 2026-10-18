import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { GitHubSource, checkedFiles, checkSkillReferences, hash, repository, safeName } from '../../bridge/server/skillSources.mjs';
import { visualBatch } from '../../bridge/protocol/visualBatch.ts';
import { SkillRegistry } from '../../bridge/server/skills.mjs';
import { ProjectStore } from '../../bridge/server/projects.mjs';
test('较大的原作者参考图包允许 64 MB，仍拒绝超过总量和单文件上限', () => {
 const bytes=Buffer.alloc(8*1024*1024);
 assert.equal(checkedFiles(Array.from({length:8},(_,i)=>({path:'assets/r'+i+'.png',bytes}))).length,8);
 assert.throws(()=>checkedFiles(Array.from({length:9},(_,i)=>({path:'assets/r'+i+'.png',bytes}))),/64 MB/);
});
test('待安装目录只有名称简介和来源，不是可执行安装；损坏项不影响已有 Skill',async t=>{
 const {registry,directory}=await registryFixture(t);
 const known=await installLocal(registry);
 const pending={repository:'https://github.com/author/pending',root:'skills/visual',name:'pending-visual',description:'待安装视觉技能',category:'海报',reason:'等待许可确认'};
 await writeFile(path.join(directory,'pending-catalog.json'),JSON.stringify([pending]));
 const entry=(await registry.list()).find(s=>s.installation.rootId==='catalog-pending');
 assert.equal(entry.installation.installed,false);assert.equal(entry.runtime.status,'unavailable');assert.equal(entry.source.path,'');assert.deepEqual(entry.examples,[]);assert.equal(entry.instructions,'');
 await assert.rejects(registry.resolve({id:entry.id}),/安装记录不存在/);
 await writeFile(path.join(directory,'pending-catalog.json'),'broken');
 assert.equal((await registry.list()).some(s=>s.id===known.id),true);
 await writeFile(path.join(directory,'pending-catalog.json'),JSON.stringify([{...pending,root:'../escape'}]));
 assert.equal((await registry.list()).length,1);
});
test('新安装普通 Skill 不因扫描成功冒充真实执行验证',async t=>{
 const {registry}=await registryFixture(t);const manifest=await installLocal(registry);
 assert.equal(manifest.installation.executionValidated,false);
 await registry.execution(manifest.id,manifest.version.bundle,true);
 assert.equal((await registry.list())[0].installation.executionValidated,true);
});

// These fixtures never call GitHub, Codex, a shell, or ImageGen.
const testRoot = path.resolve(tmpdir());
const commitA = 'a'.repeat(40), commitB = 'b'.repeat(40);
test('update change preview reports file differences without changing installed versions or instructions',async t=>{
 const fixture=fakeGitHub(),snapshot=await fixture.source.inspect('https://github.com/author/visual');let next=false;
 const github={inspect:async()=>({...snapshot,commit:next?commitB:commitA}),files:async()=>next?[file('SKILL.md',skillText('2.0.0')),file('references/new.md','new reference')]:filesFor()};
 const {registry}=await registryFixture(t,{github}),preview=await registry.preview({type:'github',url:'https://github.com/author/visual'}),installed=await registry.install({token:preview.token,path:'',trustAuthor:true}),before=structuredClone(registry.record(installed.id));next=true;
 const changes=await registry.changes(installed.id);assert.deepEqual(changes.changed,['SKILL.md']);assert.deepEqual(changes.added,['references/new.md']);assert.deepEqual(changes.removed,['LICENSE']);assert.equal(changes.to,commitB);assert.deepEqual(registry.record(installed.id),before);
});
const skillText = (version = '1.0.0', extra = '', body = 'Use native ImageGen.') => `---\nname: fixture-visual\ndescription: Offline visual skill fixture\nversion: ${version}\n${extra}---\n# Fixture\n${body}\n`;
const file = (name, contents) => ({ path: name, bytes: Buffer.from(contents) });
const filesFor = (version = '1.0.0', extra = '', body) => [file('SKILL.md', skillText(version, extra, body)), file('LICENSE', 'MIT fixture license')];
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status });

function fakeGitHub({ release = { tag_name: 'v2.0.0', html_url: 'https://github.com/author/visual/releases/tag/v2.0.0' }, tags = [{ name: 'v1.5.0' }], info = {}, tree, download, noLicense = false, licenseInfo = { license: { spdx_id: 'MIT' }, encoding: 'base64', content: Buffer.from('MIT fixture license').toString('base64') } } = {}) {
  const calls = [], contents = new Map(filesFor().map(f => [f.path, f.bytes]));
  const entries = tree || [...contents].filter(([name]) => !noLicense || name !== 'LICENSE').map(([name, bytes]) => ({ path: name, mode: '100644', type: 'blob', sha: gitBlob(bytes), size: bytes.length }));
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://api.github.com/repos/author/visual') return jsonResponse({ full_name: 'author/visual', default_branch: 'main', owner: { login: 'author' }, license: { spdx_id: 'MIT' }, ...info });
    if (url.endsWith('/releases/latest')) return release === null ? jsonResponse({ message: 'Not Found' }, 404) : jsonResponse(release);
    if (url.endsWith('/tags?per_page=1')) return jsonResponse(tags);
    if (url.includes('/commits/')) return jsonResponse({ sha: commitA });
    if (url.includes('/git/trees/')) return jsonResponse({ tree: entries, truncated: false });
    if (url.endsWith(`/license?ref=${commitA}`)) return licenseInfo === null ? jsonResponse({}, 404) : jsonResponse({ path: 'LICENSE', ...licenseInfo });
    if (url.startsWith('https://raw.githubusercontent.com/author/visual/')) {
      const name = decodeURIComponent(url.split(`/${commitA}/`)[1]);
      return download ? download(name) : new Response(contents.get(name));
    }
    throw new Error(`Unexpected fixture request: ${url}`);
  };
  return { source: new GitHubSource(fetcher), calls, contents };
}

async function registryFixture(t, options = {}) {
  const directory = await mkdtemp(path.join(testRoot, 'skill-canvas-phase5-registry-'));
  const registry = new SkillRegistry(directory, { validate: async () => ({ ready: true }), ...options });
  await registry.boot;
  t.after(async () => {
    await registry.queue.catch(() => {});
    const target = path.resolve(directory);
    if (!target.startsWith(testRoot + path.sep)) throw new Error('Unsafe test cleanup target');
    await rm(target, { recursive: true, force: true });
  });
  return { registry, directory };
}
async function localPreview(registry, files = filesFor(), folder = 'Chosen fixture folder') {
  return registry.preview({ type: 'local', folder, files: files.map(f => ({ path: f.path, data: f.bytes.toString('base64') })) });
}
async function installLocal(registry, files = filesFor(), folder) {
  const preview = await localPreview(registry, files, folder);
  return registry.install({ token: preview.token, path: preview.paths[0] });
}
async function updateLocal(registry, id, files) {
  const preview = await localPreview(registry, files);
  return registry.update(id, { token: preview.token, path: preview.paths[0] });
}
const identity = manifest => ({ id: manifest.id, bundle: manifest.version.bundle, fingerprint: manifest.source.fingerprint, commit: manifest.version.commit });

test('installation display translations persist without changing source or fixed identity',async t=>{
 const {registry}=await registryFixture(t),preview=await localPreview(registry);
 const manifest=await registry.install({token:preview.token,path:preview.paths[0],translations:{en:{name:'My visual',description:'My brief'}}});
 assert.equal(manifest.installation.translations.en.name,'My visual');assert.equal(manifest.name,'fixture-visual');assert.equal(await readFile(manifest.source.path,'utf8'),skillText());
 const updated=await updateLocal(registry,manifest.id,filesFor('2.0.0'));
 assert.equal(updated.installation.translations.en.description,'My brief');
});

test('离线安装可在登录后重新验证，不重装、不换版本、也不冒充执行成功',async t=>{
 let ready=false;const {registry}=await registryFixture(t,{validate:async()=>({ready,issue:ready?undefined:'Codex 未登录'})});
 const installed=await installLocal(registry);assert.equal(installed.runtime.status,'needs_configuration');ready=true;
 const updated=await registry.revalidate(installed.id);assert.equal(updated.runtime.status,'ready');assert.equal(updated.version.bundle,installed.version.bundle);assert.equal(updated.installation.executionValidated,false);
});
test('重新验证仍然拒绝未知脚本、缺失依赖与被篡改资源',async t=>{
 const {registry}=await registryFixture(t),installed=await installLocal(registry,[...filesFor(),file('scripts/helper.py','unsafe')]);
 assert.equal((await registry.revalidate(installed.id)).runtime.status,'needs_configuration');
 await writeFile(installed.source.path,'tampered');await assert.rejects(registry.revalidate(installed.id));
});

test('未知脚本不能通过 configure 绕过；原版本和验证状态保留', async t => {
 const {registry}=await registryFixture(t);
 const installed=await installLocal(registry,[...filesFor(),file('scripts/helper.py','print("unknown")')]);
 assert.equal(installed.runtime.status,'needs_configuration');
 await assert.rejects(registry.configure(installed.id),/专项脚本审查/);
 const after=registry.manifest(registry.record(installed.id));
 assert.equal(after.runtime.status,'needs_configuration');
 assert.equal(after.version.bundle,installed.version.bundle);
 assert.equal(after.installation.executionValidated,false);
 await assert.rejects(registry.resolve(identity(after)),/需要配置/);
});

test('模板引用匹配真实可选文件，缺失/遍历/保留路径仍拒绝', () => {
  const names = new Set(['references/layouts/flow.md','references/styles/line.md']);
  checkSkillReferences('`references/layouts/<layout>.md` and `references/styles/<style>.md`', names);
  assert.throws(() => checkSkillReferences('`references/palette/<palette>.md`', names), /没有可选/);
  for (const reference of ['references/../<style>.md','references/<style>/../flow.md','references/NUL/<style>.md','references/missing.md']) assert.throws(() => checkSkillReferences('`'+reference+'`', names));
});
test('Baoyu 选择性下载仅含目标目录、MIT许可和固定仓库案例，不导入其他 Skill', async () => {
  const candidate = visualBatch[0], prefix = candidate.root + '/';
  const contents = new Map([
    [prefix+'SKILL.md', Buffer.from('---\nname: baoyu-infographic\ndescription: fixture\n---\nNative ImageGen')],
    [prefix+'references/styles/line.md', Buffer.from('style')],
    ['skills/baoyu-comic/SKILL.md', Buffer.from('Do not download')],
    ['LICENSE', Buffer.from('MIT')],
    ...candidate.examples.map(example => [example.path, Buffer.from('controlled case fixture')]),
  ]);
  const calls = [], tree = [...contents].map(([name, bytes]) => ({path:name,type:'blob',mode:'100644',size:bytes.length,sha:gitBlob(bytes)}));
  const source = new GitHubSource(async url => { calls.push(url); return new Response(contents.get(decodeURIComponent(url.split(candidate.commit+'/')[1]))); });
  const files = await source.files({repo:'JimLiu/baoyu-skills',roots:[candidate.root,'skills/baoyu-comic'],tree,source:{repository:candidate.repository},commit:candidate.commit},candidate.root);
  assert.equal(files.length, 5); assert.ok(files.some(file => file.path === 'LICENSE'));
  assert.equal(files.filter(file => file.path.startsWith('assets/showcase/')).length, 2);
  assert.ok(calls.every(url => !url.includes('baoyu-comic')));
  assert.ok(files.every(file => !file.path.includes('baoyu-comic')));
});

test('GitHub 来源仅接受精确公开仓库 URL，不接受凭据、镜像、下载地址或注入路径', () => {
  assert.equal(repository('https://github.com/author/visual.git'), 'author/visual');
  for (const url of ['http://github.com/author/visual', 'https://github.com.evil/author/visual', 'https://user:password@github.com/author/visual', 'https://github.com:8443/author/visual', 'https://github.com/author/visual?x=1', 'https://github.com/author/visual#main', 'https://github.com/author/visual/archive/main.zip', 'file:///C:/SKILL.md', 'https://raw.githubusercontent.com/author/visual/main/SKILL.md']) assert.throws(() => repository(url));
});

test('GitHub 更新选择优先级：release 优先于 tag、默认分支 commit', async () => {
  const { source, calls } = fakeGitHub();
  const snapshot = await source.inspect('https://github.com/author/visual');
  assert.equal(snapshot.version, 'v2.0.0'); assert.equal(snapshot.commit, commitA);
  assert.ok(calls.some(c => c.url.endsWith('/commits/v2.0.0')));
  assert.ok(!calls.some(c => c.url.includes('/tags?')));
  assert.equal(snapshot.source.license, 'MIT');
  assert.ok(snapshot.source.licenseUrl.includes(commitA));
});

test('GitHub 无 release 时使用 tag，无 tag 时使用 commit；显式 ref 固定版本', async () => {
  const tagged = fakeGitHub({ release: null });
  assert.equal((await tagged.source.inspect('https://github.com/author/visual')).version, 'v1.5.0');
  const untagged = fakeGitHub({ release: null, tags: [] });
  assert.equal((await untagged.source.inspect('https://github.com/author/visual')).version, `commit:${commitA.slice(0, 12)}`);
  assert.ok(untagged.calls.some(c => c.url.endsWith('/commits/main')));
  const pinned = fakeGitHub();
  assert.equal((await pinned.source.inspect('https://github.com/author/visual', 'release/one')).version, 'release/one');
  assert.ok(pinned.calls.some(c => c.url.endsWith('/commits/release%2Fone')));
  assert.ok(!pinned.calls.some(c => c.url.endsWith('/releases/latest')));
});

test('GitHub fork、私有、镜像和重定向身份全部拒绝', async () => {
  for (const info of [{ fork: true }, { private: true }, { mirror_url: 'https://mirror.test/repo' }, { full_name: 'someone/else' }]) {
    await assert.rejects(fakeGitHub({ info }).source.inspect('https://github.com/author/visual'), /原作者|来源/);
  }
});

test('仓库不存在、网络/限流错误、缺失 SKILL.md 均明确失败', async () => {
  await assert.rejects(new GitHubSource(async () => jsonResponse({}, 404)).inspect('https://github.com/author/missing'), /404/);
  await assert.rejects(new GitHubSource(async () => jsonResponse({}, 403)).inspect('https://github.com/author/visual'), /403/);
  await assert.rejects(new GitHubSource(async () => { throw new Error('fixture offline'); }).inspect('https://github.com/author/visual'), /offline/);
  await assert.rejects(fakeGitHub({ tree: [] }).source.inspect('https://github.com/author/visual'), /SKILL.md/);
});

test('GitHub 下载固定 commit、验证 Git blob Hash；不使用凭据、不跟随重定向', async () => {
  const { source, calls } = fakeGitHub(), snapshot = await source.inspect('https://github.com/author/visual');
  const files = await source.files(snapshot, '');
  assert.equal(files[0].bytes.toString(), skillText());
  const raw = calls.filter(c => c.url.startsWith('https://raw.githubusercontent.com/'));
  assert.equal(raw.length, 2); assert.ok(raw.every(c => c.url.includes(commitA)));
  assert.ok(calls.every(c => c.options.redirect === 'error' && !c.options.headers.Authorization));
  const corrupted = fakeGitHub({ download: () => new Response('corrupt') });
  await assert.rejects(corrupted.source.files(await corrupted.source.inspect('https://github.com/author/visual'), ''), /Hash/);
  const failed = fakeGitHub({ download: () => { throw new Error('download interrupted'); } });
  await assert.rejects(failed.source.files(await failed.source.inspect('https://github.com/author/visual'), ''), /interrupted/);
});

test('路径安全：绝对路径、遍历、Windows 保留名、ADS、配置目录、大小写和文件目录冲突', () => {
  assert.equal(safeName('references/prompt.md'), 'references/prompt.md');
  for (const name of ['../escape', '/absolute', 'C:/escape', 'a\\b', 'a/./b', 'a//b', 'a/NUL.txt', 'aux', 'file:stream', '.git/config', '.Codex/config.toml', '.agents/SKILL.md', 'name.', 'name ', 'a\0b']) assert.throws(() => safeName(name), name);
  assert.throws(() => checkedFiles([file('SKILL.md', 'a'), file('skill.MD', 'b')]), /重复/);
  assert.throws(() => checkedFiles([file('references', 'a'), file('references/prompt.md', 'b')]), /冲突/);
  assert.throws(() => checkedFiles([]), /数量/);
  assert.throws(() => checkedFiles([file('large', Buffer.alloc(8 * 1024 * 1024 + 1))]), /8 MB/);
  assert.throws(() => checkedFiles(Array.from({ length: 501 }, (_, i) => file(`f${i}`, ''))), /数量/);
});

test('下载拒绝符号链接、Git 子模块和逃逸路径；不访问非法 raw 地址', async () => {
  for (const entry of [{ path: 'link', mode: '120000', type: 'blob' }, { path: 'module', mode: '160000', type: 'commit' }, { path: '../escape', mode: '100644', type: 'blob' }]) {
    const fixture = fakeGitHub(), snapshot = await fixture.source.inspect('https://github.com/author/visual');
    snapshot.tree = [entry];
    await assert.rejects(fixture.source.files(snapshot, ''));
    assert.equal(fixture.calls.filter(c => c.url.startsWith('https://raw.githubusercontent.com/')).length, 0);
  }
});

test('许可证仅记录仓库实际文件证据：无文件不能依赖 API 的 SPDX 标签', async () => {
  const fixture = fakeGitHub({ noLicense: true });
  const snapshot = await fixture.source.inspect('https://github.com/author/visual');
  assert.equal(snapshot.source.licenseStatus, '未检测到许可'); assert.equal(snapshot.source.license, null);
});

test('本地安装：稳定目录、完整资源 Hash、默认仅通知且不会执行脚本', async t => {
  const { registry } = await registryFixture(t), manifest = await installLocal(registry, [...filesFor(), file('references/prompt.md', 'reference contents')]);
  assert.equal(manifest.runtime.status, 'ready'); assert.equal(manifest.installation.updateStrategy, 'notify');
  assert.equal(manifest.source.type, 'local'); assert.equal(manifest.version.installed, '1.0.0');
  assert.ok(manifest.source.path.includes(path.join('versions', manifest.version.bundle)));
  assert.equal(await registry.resolve(identity(manifest)), manifest.source.path);
  const withScript = await installLocal(registry, [file('SKILL.md', skillText().replace('fixture-visual', 'script-fixture')), file('scripts/install.ps1', 'throw "must never execute"')], 'Script fixture');
  assert.equal(withScript.runtime.status, 'needs_configuration');
  await assert.rejects(registry.resolve(identity(withScript)), /需要配置/);
});

test('本地目录缺失 SKILL.md、过期摘要、错误路径和重复安装均不能覆盖已有版本', async t => {
  const { registry } = await registryFixture(t);
  await assert.rejects(localPreview(registry, [file('README.md', 'no skill')]), /SKILL.md/);
  await assert.rejects(registry.install({ token: 'missing', path: '' }), /过期/);
  const preview = await localPreview(registry);
  await assert.rejects(registry.install({ token: preview.token, path: '../outside' }), /选择/);
  const first = await registry.install({ token: preview.token, path: '' });
  await assert.rejects(installLocal(registry), /已安装/);
  await assert.rejects(installLocal(registry, filesFor('2.0.0'), 'Another folder'), /名称|ID/);
  assert.equal((await registry.list()).length, 1); assert.equal((await registry.list())[0].version.bundle, first.version.bundle);
});

test('安装拒绝无效 YAML、无 frontmatter 和不存在的必需资源', async t => {
  const { registry } = await registryFixture(t);
  for (const contents of ['# Missing frontmatter', '---\nname: [broken\n---\nbody', skillText('1.0.0', '', 'Read `references/missing.md`.')]) {
    await assert.rejects(installLocal(registry, [file('SKILL.md', contents)]));
  }
  assert.deepEqual(await registry.list(), []);
});

test('安装严格要求 frontmatter 的 name 和 description，不能从正文伪装补齐', async t => {
  const { registry } = await registryFixture(t);
  for (const contents of ['---\nname: fixture-visual\n---\n# Fixture\nBody has a fallback description.', '---\ndescription: Has description\n---\n# fixture-visual\nBody.']) {
    await assert.rejects(installLocal(registry, [file('SKILL.md', contents)]), /Manifest|frontmatter|名称|描述/);
  }
});

test('GitHub 安装要求原作者确认及实际许可证，下载失败不会产生安装记录', async t => {
  const fixture = fakeGitHub(), { registry } = await registryFixture(t, { github: fixture.source });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  await assert.rejects(registry.install({ token: preview.token, path: '' }), /原作者/);
  const installed = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  assert.equal(installed.version.commit, commitA); assert.equal(installed.source.author, 'author');
  const unlicensed = fakeGitHub({ noLicense: true }), blocked = await registryFixture(t, { github: unlicensed.source });
  const other = await blocked.registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  await assert.rejects(blocked.registry.install({ token: other.token, path: '', trustAuthor: true }), /许可证/);
  assert.deepEqual(await blocked.registry.list(), []);
  const broken = fakeGitHub({ download: () => { throw new Error('offline download'); } }), failed = await registryFixture(t, { github: broken.source });
  const missing = await failed.registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  await assert.rejects(failed.registry.install({ token: missing.token, path: '', trustAuthor: true }), /offline/);
  assert.deepEqual(await failed.registry.list(), []);
});

test('检查更新不更换当前版本；锁定禁止更新；跳过绑定真实 commit', async t => {
  let latestCommit = commitA, latestVersion = 'v1.0.0';
  const fixture = fakeGitHub(), original = await fixture.source.inspect('https://github.com/author/visual');
  const github = { inspect: async () => ({ ...original, commit: latestCommit, version: latestVersion }), files: async () => filesFor(latestVersion.replace('v', '')) };
  const { registry } = await registryFixture(t, { github });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  const first = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  latestCommit = commitB; latestVersion = 'v2.0.0';
  const checked = await registry.check(first.id);
  assert.equal(checked.version.updateStatus, 'available'); assert.equal(checked.version.installed, 'v1.0.0'); assert.equal(checked.version.latestCommit, commitB);
  assert.equal((await registry.action(first.id, 'skip')).version.updateStatus, 'skipped');
  assert.equal((await registry.action(first.id, 'lock', { locked: true })).version.updateStatus, 'locked');
  await assert.rejects(registry.update(first.id), /锁定/);
  await registry.action(first.id, 'lock', { locked: false });
  const second = await registry.update(first.id); assert.equal(second.version.commit, commitB);
  assert.equal(second.version.updateStatus, 'current', '手动安装曾跳过的版本后，不应仍显示已跳过');
  assert.equal(await registry.resolve(identity(first)), first.source.path);
  github.inspect = async () => { throw new Error('network offline'); };
  await assert.rejects(registry.check(first.id), /offline/);
  const failedCheck = (await registry.list())[0]; assert.equal(failedCheck.version.installed, 'v2.0.0'); assert.ok(failedCheck.installation.lastError.includes('offline'));
});

test('正常更新保留不可变旧版；重启后旧项目仍解析旧版和原 commit', async t => {
  const { registry, directory } = await registryFixture(t), first = await installLocal(registry);
  await registry.execution(first.id, first.version.bundle, true);
  const second = await updateLocal(registry, first.id, filesFor('2.0.0'));
  assert.notEqual(first.version.bundle, second.version.bundle); assert.equal(second.installation.previousVersion, '1.0.0');
  assert.equal(await registry.resolve(identity(first)), first.source.path);
  assert.equal(await readFile(first.source.path, 'utf8'), skillText());
  const reopened = new SkillRegistry(directory, { validate: async () => ({ ready: true }) });
  assert.equal((await reopened.list())[0].version.installed, '2.0.0');
  assert.equal(await reopened.resolve(identity(first)), first.source.path);
  await assert.rejects(reopened.resolve({ ...identity(first), commit: commitB }), /身份不匹配/);
});

test('文件资源变化（即使 SKILL.md 不变）也建立独立版本，避免资源暗中更新', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry, [...filesFor(), file('references/prompt.md', 'old reference')]);
  const second = await updateLocal(registry, first.id, [...filesFor(), file('references/prompt.md', 'new reference')]);
  assert.equal(first.source.fingerprint, second.source.fingerprint); assert.notEqual(first.version.bundle, second.version.bundle);
  assert.equal(await readFile(path.join(path.dirname(first.source.path), 'references/prompt.md'), 'utf8'), 'old reference');
});

test('更新解析失败、缺依赖、外部脚本、Codex 不识别时保留原版并记录错误', async t => {
  let codexReady = true;
  const { registry } = await registryFixture(t, { validate: async () => ({ ready: codexReady, issue: 'Codex did not recognize skill' }) });
  const first = await installLocal(registry);
  const cases = [[file('SKILL.md', '---\nname: [broken\n---')], filesFor('2.0.0', 'dependencies:\n  - name: absent-command\n    type: command\n'), [...filesFor('2.0.0'), file('scripts/unknown.py', 'print("never run")')]];
  for (const files of cases) {
    await assert.rejects(updateLocal(registry, first.id, files), /更新失败/);
    const actual = (await registry.list())[0]; assert.equal(actual.version.bundle, first.version.bundle); assert.ok(actual.installation.lastError);
  }
  codexReady = false;
  await assert.rejects(updateLocal(registry, first.id, filesFor('2.0.0')), /Codex/);
  assert.equal(await registry.resolve(identity(first)), first.source.path);
  assert.equal(registry.record(first.id).audit.filter(item => item.action === 'update_failed').length, 4);
});

test('手动回滚切换至保留旧版，新版快照仍可追溯；没有历史不允许回滚', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry);
  await assert.rejects(registry.action(first.id, 'rollback'), /没有/);
  await registry.execution(first.id, first.version.bundle, true);
  const second = await updateLocal(registry, first.id, filesFor('2.0.0'));
  const rollback = await registry.action(first.id, 'rollback');
  assert.equal(rollback.version.bundle, first.version.bundle); assert.equal(await registry.resolve(identity(second)), second.source.path);
  assert.ok(registry.record(first.id).audit.some(item => item.action === 'rollback'));
});

test('新版运行失败自动恢复上一稳定版，保留失败版和失败原因', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry);
  await registry.execution(first.id, first.version.bundle, true);
  const second = await updateLocal(registry, first.id, filesFor('2.0.0'));
  await registry.execution(first.id, second.version.bundle, false, 'ImageGen skill instructions invalid');
  const current = (await registry.list())[0];
  assert.equal(current.version.bundle, first.version.bundle); assert.ok(current.installation.lastError.includes('自动恢复'));
  assert.ok(registry.record(first.id).versions[second.version.bundle]);
  assert.ok(registry.record(first.id).audit.some(item => item.action === 'runtime_rollback' && item.failed === second.version.bundle));
});

test('连续更新不能丢失最后已运行成功的稳定版：V3 失败回到稳定 V1 而非未验证 V2', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry);
  await registry.execution(first.id, first.version.bundle, true);
  await updateLocal(registry, first.id, filesFor('2.0.0'));
  const third = await updateLocal(registry, first.id, filesFor('3.0.0'));
  await registry.execution(first.id, third.version.bundle, false, 'fixture failure');
  assert.equal((await registry.list())[0].version.bundle, first.version.bundle);
});

test('文件篡改使执行/回滚失败，不静默使用损坏资源', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry);
  await registry.execution(first.id, first.version.bundle, true);
  const second = await updateLocal(registry, first.id, filesFor('2.0.0'));
  await writeFile(first.source.path, 'tampered');
  await assert.rejects(registry.resolve(identity(first)), /损坏|修改/);
  await assert.rejects(registry.action(first.id, 'rollback'), /损坏|修改/);
  assert.equal((await registry.list())[0].version.bundle, second.version.bundle);
});

test('移除必须二次确认；重启保留历史元数据与版本文件，禁止继续生成', async t => {
  const { registry, directory } = await registryFixture(t), first = await installLocal(registry);
  await assert.rejects(registry.action(first.id, 'remove'), /二次确认/);
  assert.equal((await registry.list())[0].installation.installed, true);
  const removed = await registry.action(first.id, 'remove', { confirm: true });
  assert.equal(removed.installation.installed, false); assert.equal(removed.runtime.status, 'unavailable');
  await assert.rejects(registry.resolve(identity(first)), /已移除/);
  assert.equal(await readFile(first.source.path, 'utf8'), skillText());
  const reopened = new SkillRegistry(directory);
  assert.equal((await reopened.list())[0].installation.installed, false);
  assert.equal(reopened.record(first.id).versions[first.version.bundle].manifest.version.installed, '1.0.0');
  await assert.rejects(reopened.resolve(identity(first)), /已移除/);
  const restored = await installLocal(reopened); assert.equal(restored.id, first.id); assert.equal(restored.installation.installed, true);
});

test('哈希使用真实字节而非文件名：SHA256 可重复且区分内容', () => {
  assert.equal(hash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(hash('old'), hash('new'));
});

test('安装前摘要给出兼容性和依赖，但不提交安装；未完成 review 不妨碍重启', async t => {
  const { registry, directory } = await registryFixture(t);
  const preview = await localPreview(registry, filesFor('1.0.0', 'dependencies:\n  - name: imagemagick\n    type: command\n'));
  const summary = await registry.review({ token: preview.token, path: '' });
  assert.equal(summary.name, 'fixture-visual'); assert.equal(summary.version.installed, '1.0.0');
  assert.equal(summary.runtime.status, 'needs_configuration');
  assert.equal(summary.runtime.dependencies[0].name, 'imagemagick');
  assert.equal(summary.source.licenseStatus, '无法确认');
  assert.deepEqual(await registry.list(), []);
  const reopened = new SkillRegistry(directory);
  assert.deepEqual(await reopened.list(), []);
  const installed = await registry.install({ token: preview.token, path: '' });
  assert.equal(installed.id, summary.id); assert.equal(installed.runtime.status, 'needs_configuration');
});

test('失败安装残留的 staging/版本目录不会被重启误认成安装，也不会阻塞其它 Skill', async t => {
  const { registry, directory } = await registryFixture(t);
  const first = await installLocal(registry);
  await assert.rejects(installLocal(registry, filesFor('2.0.0'), 'Duplicate name leaves a staged bundle'), /名称|ID/);
  const invalid = [...filesFor(), file('SKILL.json', '{broken-json')];
  await assert.rejects(installLocal(registry, invalid, 'Invalid sidecar leaves staged files'), /SKILL.json/);
  const reopened = new SkillRegistry(directory, { validate: async () => ({ ready: true }) });
  assert.equal((await reopened.list()).length, 1);
  assert.equal((await reopened.list())[0].id, first.id);
  assert.equal(await reopened.resolve(identity(first)), first.source.path);
});

test('同字节、不同 Git commit 仍建立独立身份，旧项目的 commit 不会被覆写', async t => {
  const fixture = fakeGitHub(), snapshot = await fixture.source.inspect('https://github.com/author/visual');
  let commit = commitA, version = 'v1.0.0';
  const github = { inspect: async () => ({ ...snapshot, commit, version }), files: async () => filesFor() };
  const { registry, directory } = await registryFixture(t, { github });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  const first = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  await registry.execution(first.id, first.version.bundle, true);
  commit = commitB; version = 'v1.0.1';
  const second = await registry.update(first.id);
  assert.equal(first.source.fingerprint, second.source.fingerprint); assert.notEqual(first.version.bundle, second.version.bundle);
  assert.notEqual(first.source.path, second.source.path); assert.equal(second.version.commit, commitB);
  const reopened = new SkillRegistry(directory);
  assert.equal(await reopened.resolve(identity(first)), first.source.path);
  assert.equal(await reopened.resolve(identity(second)), second.source.path);
  assert.equal(reopened.record(first.id).versions[first.version.bundle].manifest.version.commit, commitA);
});

test('最新版本检查失败不改变当前指针；GitHub 下载失败也保留稳定版', async t => {
  const fixture = fakeGitHub(), snapshot = await fixture.source.inspect('https://github.com/author/visual');
  let broken = false;
  const github = { inspect: async () => ({ ...snapshot, commit: broken ? commitB : commitA }), files: async () => { if (broken) throw new Error('download interrupted'); return filesFor(); } };
  const { registry } = await registryFixture(t, { github });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  const first = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  await registry.execution(first.id, first.version.bundle, true); broken = true;
  await assert.rejects(registry.update(first.id), /download interrupted/);
  const actual = (await registry.list())[0];
  assert.equal(actual.version.bundle, first.version.bundle); assert.equal(registry.record(first.id).previous, null);
  assert.equal(await registry.resolve(identity(first)), first.source.path);
});

test('SKILL.json 外部工具依赖需配置，不触发任何安装脚本或工具调用', async t => {
  const { registry } = await registryFixture(t);
  const manifest = await installLocal(registry, [...filesFor(), file('SKILL.json', JSON.stringify({ dependencies: { tools: [{ type: 'mcp', value: 'not-installed' }] } }))]);
  assert.equal(manifest.runtime.status, 'needs_configuration');
  assert.ok(manifest.runtime.issues.some(issue => issue.includes('SKILL.json')));
  await assert.rejects(registry.resolve(identity(manifest)), /需要配置/);
});

test('本地必需文件依赖存在才就绪；缺失文件只安装为待配置', async t => {
  const { registry } = await registryFixture(t);
  const readyFiles = [...filesFor('1.0.0', 'dependencies:\n  - name: assets/palette.txt\n    type: file\n'), file('assets/palette.txt', 'red, white')];
  const ready = await installLocal(registry, readyFiles);
  assert.equal(ready.runtime.status, 'ready'); assert.equal(ready.runtime.dependencies[0].status, 'available');
  const missing = readyFiles.filter(f => f.path === 'SKILL.md').map(f => file(f.path, f.bytes.toString().replace('fixture-visual', 'missing-file-fixture')));
  const pending = await installLocal(registry, missing, 'Missing asset fixture');
  assert.equal(pending.runtime.status, 'needs_configuration'); assert.equal(pending.runtime.dependencies[0].status, 'missing');
});

test('本地嵌套 Skill 显式选择路径，只安装其目录内容', async t => {
  const { registry } = await registryFixture(t);
  const files = [...filesFor().map(f => ({ ...f, path: `collection/one/${f.path}` })), file('collection/other/README.md', 'not installed')];
  const preview = await localPreview(registry, files);
  assert.deepEqual(preview.paths, ['collection/one']);
  const installed = await registry.install({ token: preview.token, path: 'collection/one' });
  assert.deepEqual(registry.record(installed.id).versions[installed.version.bundle].files.map(f => f.path).sort(), ['LICENSE', 'SKILL.md']);
  assert.equal(installed.source.skillRoot, 'collection/one');
});

test('并发确认同一个摘要最多安装一次，保留唯一 ID', async t => {
  const { registry } = await registryFixture(t), preview = await localPreview(registry);
  const results = await Promise.allSettled([registry.install({ token: preview.token, path: '' }), registry.install({ token: preview.token, path: '' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await registry.list()).length, 1);
});

test('实际 junction 不能把已安装 Skill 的读取或后续写入重定向到管理目录外', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry);
  const exterior = await mkdtemp(path.join(testRoot, 'skill-canvas-phase5-outside-'));
  t.after(async () => {
    const target = path.resolve(exterior);
    if (!target.startsWith(testRoot + path.sep)) throw new Error('Unsafe exterior fixture cleanup');
    await rm(target, { recursive: true, force: true });
  });
  await writeFile(path.join(exterior, 'SKILL.md'), skillText());
  await writeFile(path.join(exterior, 'LICENSE'), 'MIT fixture license');
  const original = path.dirname(first.source.path);
  assert.ok(original.startsWith(registry.root + path.sep));
  await rename(original, `${original}-retained-test-only`);
  try { await symlink(exterior, original, 'junction'); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'ENOTSUP') { t.skip('Host disallows filesystem junction fixtures'); return; } throw error; }
  await assert.rejects(registry.resolve(identity(first)), /越界/);
  await assert.rejects(registry.directory(path.join(original, 'attempted-write')), /链接|异常/);
  assert.equal(await readFile(path.join(exterior, 'SKILL.md'), 'utf8'), skillText());
  await assert.rejects(readFile(path.join(exterior, 'attempted-write')), { code: 'ENOENT' });
});

test('正式项目发布后，更新/回滚/移除 Skill 均不改写原 commit、Prompt、参数及 PNG 原字节', async t => {
  const fixture = fakeGitHub(), snapshot = await fixture.source.inspect('https://github.com/author/visual');
  let currentCommit = commitA;
  const github = { inspect: async () => ({ ...snapshot, commit: currentCommit }), files: async () => filesFor() };
  const { registry, directory } = await registryFixture(t, { github });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  const first = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  const projects = new ProjectStore(path.join(directory, 'Projects-fixture-only'));
  const png = await readFile('public/artwork/category-photo.png'), temporary = path.join(directory, 'fixture-output.png');
  await writeFile(temporary, png);
  const task = {
    taskId: randomUUID(), projectId: randomUUID(), action: 'generate_image', stage: 'running', sequence: 1,
    threadId: 'fixture-original-thread', turnId: 'fixture-original-turn', instruction: 'Actual fixture execution instruction',
    payload: { skill: { ...identity(first), version: first.version.installed }, manifest: structuredClone(first), images: [], request: { prompt: 'Original user request' }, extensions: { palette: 'blue' } },
  };
  await projects.record(task);
  const published = await projects.publish(task, { taskId: task.taskId, finalPrompt: 'Original final prompt', outputs: [{ id: 'original', path: temporary, sha256: hash(png) }], metadata: { skillCommit: commitA } });
  const metadataPath = await projects.file(task.projectId, 'metadata/project.json'), initialMetadata = await readFile(metadataPath);
  await registry.execution(first.id, first.version.bundle, true);
  currentCommit = commitB;
  await registry.update(first.id);
  await registry.action(first.id, 'rollback');
  await registry.action(first.id, 'remove', { confirm: true });
  assert.deepEqual(await readFile(metadataPath), initialMetadata);
  const reopened = new ProjectStore(projects.root), history = await reopened.read(task.projectId);
  assert.equal(history.tasks[0].payload.skill.commit, commitA);
  assert.equal(history.tasks[0].payload.manifest.version.commit, commitA);
  assert.equal(history.tasks[0].instruction, task.instruction);
  assert.equal(history.tasks[0].payload.request.prompt, 'Original user request');
  assert.deepEqual(history.tasks[0].payload.extensions, { palette: 'blue' });
  assert.equal(history.versions[0].finalPrompt, 'Original final prompt');
  assert.deepEqual(await reopened.bytes(task.projectId, published.outputs[0].path, published.outputs[0].sha256), png);
});

test('安装拒绝第三方占用内置 imagegen 保留名称，现有安装表不变', async t => {
  const { registry } = await registryFixture(t);
  await assert.rejects(installLocal(registry, filesFor().map(item => item.path === 'SKILL.md' ? file(item.path, item.bytes.toString().replace('fixture-visual', 'imagegen')) : item)), /保留名称|内置/);
  assert.deepEqual(await registry.list(), []);
});

test('不可变版本新增文件也视为篡改，即使原有文件的 Hash 都未改变', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry);
  const originalBytes = await readFile(first.source.path);
  await writeFile(path.join(path.dirname(first.source.path), 'injected-instructions.md'), 'Unauthorized additional instructions');
  assert.deepEqual(await readFile(first.source.path), originalBytes);
  await assert.rejects(registry.resolve(identity(first)), /文件集合|修改/);
});

test('不可变版本内新增 junction 即使指向管理目录内部，也不允许执行', async t => {
  const { registry } = await registryFixture(t), first = await installLocal(registry);
  const target = path.join(registry.root, 'internal-junction-target-fixture');
  await mkdir(target);
  const link = path.join(path.dirname(first.source.path), 'injected-reference-link');
  try { await symlink(target, link, 'junction'); }
  catch (error) { if (error.code === 'EPERM' || error.code === 'ENOTSUP') { t.skip('Host disallows filesystem junction fixtures'); return; } throw error; }
  await assert.rejects(registry.resolve(identity(first)), /符号链接|文件集合/);
});

test('更新提交首次写入失败后保存错误记录，仍保持旧 current/previous，不把失败的新版本标为已安装', async t => {
  const { registry, directory } = await registryFixture(t), first = await installLocal(registry);
  await registry.execution(first.id, first.version.bundle, true);
  const before = registry.record(first.id), originalSave = registry.save.bind(registry);
  let saveAttempts = 0;
  registry.save = async record => {
    saveAttempts += 1;
    if (saveAttempts === 1) throw new Error('fixture disk locked during version activation');
    return originalSave(record);
  };
  await assert.rejects(updateLocal(registry, first.id, filesFor('2.0.0')), /更新失败|disk locked/);
  assert.equal(saveAttempts, 2);
  const after = registry.record(first.id);
  assert.equal(after.current, before.current);
  assert.equal(after.previous, before.previous);
  assert.deepEqual(Object.keys(after.versions), Object.keys(before.versions));
  assert.equal(after.audit.at(-1).action, 'update_failed');
  assert.ok(after.lastError.includes('disk locked'));
  const restarted = new SkillRegistry(directory);
  assert.equal((await restarted.list())[0].version.bundle, first.version.bundle);
  assert.equal(await restarted.resolve(identity(first)), first.source.path);
});

test('安装指定旧 tag 时许可证来自该 commit 的内容，不继承默认分支的新许可证标签', async () => {
  const fixture = fakeGitHub({ info: { license: { spdx_id: 'MIT' } }, licenseInfo: { license: { spdx_id: 'BSD-3-Clause' }, encoding: 'base64', content: Buffer.from('Old selected commit license fixture').toString('base64') } });
  const selected = await fixture.source.inspect('https://github.com/author/visual', 'v1.0.0');
  assert.equal(selected.source.license, 'BSD-3-Clause');
  assert.equal(selected.source.licenseStatus, '明确许可');
  assert.ok(fixture.calls.some(call => call.url.endsWith(`/license?ref=${commitA}`)));
  assert.ok(selected.source.licenseUrl.includes(`/blob/${commitA}/LICENSE`));
});

test('LICENSE 文件存在但缺失版本化许可证据、内容为空或 NOASSERTION，不能标为明确许可', async () => {
  for (const licenseInfo of [null, { license: { spdx_id: 'MIT' }, content: '' }, { license: { spdx_id: 'NOASSERTION' }, content: Buffer.from('Unknown terms').toString('base64') }, { path: 'LICENSE-other', license: { spdx_id: 'MIT' }, content: Buffer.from('Wrong file fixture').toString('base64') }]) {
    const fixture = fakeGitHub({ licenseInfo });
    const snapshot = await fixture.source.inspect('https://github.com/author/visual');
    assert.notEqual(snapshot.source.licenseStatus, '明确许可');
  }
});

for (const corruption of ['invalid-json', 'wrong-id', 'missing-current']) test(`启动隔离单条损坏元数据 (${corruption})，其它已安装 Skill 仍可列出及运行`, async t => {
  const { registry, directory } = await registryFixture(t), healthy = await installLocal(registry);
  const badFiles = filesFor().map(item => item.path === 'SKILL.md' ? file(item.path, item.bytes.toString().replace('fixture-visual', 'corrupt-record-fixture')) : item);
  const broken = await installLocal(registry, badFiles, 'Corrupt metadata fixture');
  const record = registry.record(broken.id);
  if (corruption === 'wrong-id') record.id = `managed-${'0'.repeat(24)}`;
  if (corruption === 'missing-current') record.current = 'missing-version-key';
  const contents = corruption === 'invalid-json' ? '{incomplete record' : JSON.stringify(record);
  const metadata = path.join(directory, broken.id, 'metadata/record.json');
  await writeFile(metadata, contents);
  const reopened = new SkillRegistry(directory, { validate: async () => ({ ready: true }) });
  const catalog = await reopened.list();
  assert.ok(catalog.some(manifest => manifest.id === healthy.id && manifest.runtime.status === 'ready'));
  assert.ok(!catalog.some(manifest => manifest.id === broken.id && manifest.runtime.status === 'ready'));
  assert.equal(await reopened.resolve(identity(healthy)), healthy.source.path);
  assert.equal(await readFile(metadata, 'utf8'), contents, '损坏原记录应保留以便恢复，不得静默覆写');
});

test('同 commit/同字节的新 ref 不更改历史安装版本、bundle 或已冻结的任务身份', async t => {
  const fixture = fakeGitHub(), original = await fixture.source.inspect('https://github.com/author/visual');
  let latestVersion = 'v1.0.0';
  const github = { inspect: async () => ({ ...original, version: latestVersion }), files: async () => filesFor() };
  const { registry, directory } = await registryFixture(t, { github });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  const first = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  const frozen = { ...identity(first), version: first.version.installed, name: first.name };
  latestVersion = 'v1.0.0-alias';
  const checked = await registry.check(first.id);
  assert.equal(checked.version.updateStatus, 'current');
  const unchanged = await registry.update(first.id);
  assert.equal(unchanged.version.bundle, first.version.bundle);
  assert.equal(unchanged.version.installed, first.version.installed);
  const reopened = new SkillRegistry(directory);
  assert.equal(await reopened.resolve(frozen), first.source.path);
  assert.equal(Object.keys(reopened.record(first.id).versions).length, 1);
});

test('移除后用同 commit 的另一 ref 重装，不覆盖原 bundle 的版本身份并保持旧项目可执行', async t => {
  const fixture = fakeGitHub(), original = await fixture.source.inspect('https://github.com/author/visual');
  let latestVersion = 'v1.0.0';
  const github = { inspect: async () => ({ ...original, version: latestVersion }), files: async () => filesFor() };
  const { registry, directory } = await registryFixture(t, { github });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  const first = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  const frozen = { ...identity(first), version: first.version.installed, name: first.name };
  await registry.action(first.id, 'remove', { confirm: true });
  latestVersion = 'v1.0.0-alias';
  const reinstallPreview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  await registry.install({ token: reinstallPreview.token, path: '', trustAuthor: true });
  const reopened = new SkillRegistry(directory);
  assert.equal(await reopened.resolve(frozen), first.source.path);
  assert.equal(reopened.record(first.id).versions[first.version.bundle].manifest.version.installed, first.version.installed);
});

test('更新检查网络失败后重启仍保留 current、稳定版、锁定/跳过及旧项目执行能力', async t => {
  const fixture = fakeGitHub(), original = await fixture.source.inspect('https://github.com/author/visual');
  let offline = false, currentCommit = commitA;
  const github = { inspect: async () => { if (offline) throw new Error('fixture rate limit'); return { ...original, commit: currentCommit }; }, files: async () => filesFor() };
  const { registry, directory } = await registryFixture(t, { github });
  const preview = await registry.preview({ type: 'github', url: 'https://github.com/author/visual' });
  const first = await registry.install({ token: preview.token, path: '', trustAuthor: true });
  await registry.execution(first.id, first.version.bundle, true);
  currentCommit = commitB;
  await registry.check(first.id);
  await registry.action(first.id, 'skip');
  await registry.action(first.id, 'lock', { locked: true });
  const before = registry.record(first.id);
  offline = true;
  await assert.rejects(registry.check(first.id), /rate limit/);
  const reopened = new SkillRegistry(directory);
  await reopened.boot;
  const after = reopened.record(first.id);
  assert.equal(after.current, before.current);
  assert.equal(after.previous, before.previous);
  assert.equal(after.locked, true);
  assert.equal(after.skipped, commitB);
  assert.deepEqual(after.versions, before.versions);
  assert.ok(after.lastError.includes('rate limit'));
  assert.equal(await reopened.resolve({ ...identity(first), version: first.version.installed }), first.source.path);
});
