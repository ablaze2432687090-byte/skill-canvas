import test from 'node:test';
import assert from 'node:assert/strict';
import { displaySkillName, projectPresentation, projectRoute, projectTitle, skillPresentation } from '../../src/application/presentation.ts';
import { presentationManifest, presentationProject } from '../fixtures/presentation.ts';

test('友好名称与摘要不改变原始 Manifest、ID 或版本', () => {
  const manifest = presentationManifest('gc-minimal-zine-poster-v0-3');
  const before = JSON.stringify(manifest), view = skillPresentation(manifest);
  assert.equal(view.displayName, 'Minimal Zine Poster'); assert.equal(view.rawName, manifest.name);
  assert.equal(view.versionLabel, 'v1.0.0'); assert.ok(view.displayDescription.length < 80); assert.equal(JSON.stringify(manifest), before);
});
test('已知 imagegen 简短中文摘要与 Hash 版本展示', () => {
  const manifest = presentationManifest(); manifest.version.installed = 'sha256:' + 'a'.repeat(64);
  const view = skillPresentation(manifest); assert.match(view.displayDescription, /文字或参考图片/); assert.equal(view.versionLabel, '本地版本');
});
test('未知英文 Skill 不推测能力；中文摘要保留', () => {
  const manifest = presentationManifest('plain-visual-tool');
  assert.equal(displaySkillName(manifest.name), 'Plain Visual Tool'); assert.match(skillPresentation(manifest).displayDescription, /详细能力见使用说明/);
  manifest.description = '这是来源声明的中文说明'; assert.equal(skillPresentation(manifest).displayDescription, manifest.description);
});
test('本机案例严格匹配 Skill 身份、不可变版本，并记录原图证据', () => {
  const manifest = presentationManifest(), project = presentationProject(manifest), view = skillPresentation(manifest, {}, [project]);
  assert.equal(view.examples.length, 1); assert.equal(view.featuredExample?.exampleSource, 'local_verified');
  assert.equal(view.featuredExample?.taskId, project.generations[0].id); assert.equal(view.featuredExample?.sha256, 'b'.repeat(64));
  assert.deepEqual(view.displayInputCapabilities, ['文本']);
});
test('参考图输入能力仅在相同版本真实成功任务中得到验证', () => {
  const manifest = presentationManifest(), project = presentationProject(manifest);
  project.generations[0].codex!.compiledTask!.images = [{ id: 'ref', name: 'ref.png', role: 'edit_target', mime: 'image/png', path: 'test-only.png' }];
  assert.deepEqual(skillPresentation(manifest, {}, [project]).displayInputCapabilities, ['文本', '参考图片']);
});
test('未知输入能力标记未验证，不猜测', () => assert.deepEqual(skillPresentation(presentationManifest()).displayInputCapabilities, ['未验证']));
test('声明输入不冒充已实测能力，原始声明仍保留', () => {
  const manifest = presentationManifest(); manifest.inputs = [{ id: 'image', type: '图片', required: false, label: '参考图' }];
  assert.deepEqual(skillPresentation(manifest).displayInputCapabilities, ['未验证']); assert.equal(manifest.inputs[0].type, '图片');
});
test('更新后的版本不借用旧案例，原项目快照仍能展示', () => {
  const original = presentationManifest(), project = presentationProject(original), updated = structuredClone(original);
  updated.version.bundle = 'fixture-bundle-v2'; assert.equal(skillPresentation(updated, {}, [project]).examples.length, 0);
  assert.equal(skillPresentation(project.skillSnapshot!, {}, [project]).examples.length, 1);
});
test('相同名称不同 ID 不混用案例', () => {
  const manifest = presentationManifest(), other = presentationManifest('imagegen', 'other');
  assert.equal(skillPresentation(manifest, {}, [presentationProject(other)]).examples.length, 0);
});
test('失败、模拟、无 Hash、未载入的结果均不能成为实测案例', () => {
  const manifest = presentationManifest(), original = presentationProject(manifest);
  for (const mutate of [
    (project: typeof original) => { project.generations[0].status = 'failed'; },
    (project: typeof original) => { project.generations[0].codex = undefined; },
    (project: typeof original) => { project.generations[0].codex!.result!.outputs[0].sha256 = ''; },
    (project: typeof original) => { project.generations[0].versions[0].image = 'asset:not-loaded'; },
  ]) { const project = structuredClone(original); mutate(project); assert.equal(skillPresentation(manifest, {}, [project]).examples.length, 0); }
});
test('仓库声明案例优先于本机实测，来源不冒充验证', () => {
  const manifest = presentationManifest(); manifest.source.type = 'github';
  manifest.examples = [{ id: 'author', imageRef: 'asset:declared', beforeRef: 'asset:before', label: '作者提供', source: 'declared', verified: false }];
  const view = skillPresentation(manifest, { 'asset:declared': 'blob:author' }, [presentationProject(manifest)]);
  assert.equal(view.featuredExample?.exampleSource, 'repository'); assert.equal(view.featuredExample?.verified, false); assert.equal(view.examples.length, 2);
  assert.ok(!('before' in view.featuredExample!));
});
test('案例去重；没有资料时明确为空', () => {
  const manifest = presentationManifest(), project = presentationProject(manifest);
  assert.equal(skillPresentation(manifest, {}, [project, project]).examples.length, 1);
  assert.equal(skillPresentation(manifest).featuredExample, undefined);
});
test('三种正式可用状态依据 runtime，而非扫描成功', () => {
  const manifest = presentationManifest(); assert.equal(skillPresentation(manifest).displayStatus, '可用');
  manifest.runtime.status = 'needs_configuration'; assert.equal(skillPresentation(manifest).displayStatus, '需要配置');
  manifest.runtime.status = 'incompatible'; assert.equal(skillPresentation(manifest).displayStatus, '暂不可用');
});
test('历史长 Prompt 主标题归一化；自定义短标题不被覆写', () => {
  const project = presentationProject(presentationManifest()); project.title = project.draft.prompt.slice(0, 40);
  assert.equal(projectTitle(project), '未命名作品'); project.title = '秋日慢读'; assert.equal(projectTitle(project), '秋日慢读');
});
test('项目封面来自正式成功版本，不使用草稿参考图 thumbnail', () => {
  const project = presentationProject(presentationManifest()); assert.equal(projectPresentation(project).image, '/artwork/result-v4.png');
  project.generations = []; project.status = 'ready'; const view = projectPresentation(project);
  assert.equal(view.image, ''); assert.equal(view.status, '草稿'); assert.equal(view.route, '/create');
});
test('完成、草稿、失败、运行项目共用确定性打开路由', () => {
  const project = presentationProject(presentationManifest()); const id = project.generations[0].id;
  assert.equal(projectRoute(project), '/result/' + id);
  for (const status of ['failed', 'running', 'cancelled', 'queued'] as const) { project.status = status; assert.equal(projectRoute(project), '/task/' + id); }
  project.status = 'draft'; assert.equal(projectRoute(project), '/create');
});
test('续改失败保留前版真实封面，并显式提示失败', () => {
  const project = presentationProject(presentationManifest()); project.status = 'failed';
  assert.equal(projectPresentation(project).hasResult, true); assert.equal(projectPresentation(project).status, '生成失败');
});
