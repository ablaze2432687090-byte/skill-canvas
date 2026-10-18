import test from 'node:test';
import assert from 'node:assert/strict';
import { visualBatch, batchForSource } from '../../bridge/protocol/visualBatch.ts';
import { compileCodexTask } from '../../src/application/codexTaskCompiler.ts';
import { applySkillParameters } from '../../src/application/skillViews.ts';
import { createShowcaseProjects } from '../../src/application/showcase.ts';
import { executionManifest, declaredExampleAssets } from '../../bridge/protocol/executionManifest.ts';
import { skillPresentation } from '../../src/application/presentation.ts';
import { presentationManifest, presentationProject } from '../fixtures/presentation.ts';

function manifestFor(candidate: typeof visualBatch[number]) {
  const manifest = presentationManifest(candidate.name, candidate.name);
  manifest.source = { ...manifest.source, type: 'github', repository: candidate.repository, skillRoot: candidate.root };
  manifest.version.commit = candidate.commit; manifest.parameters = structuredClone(candidate.parameters);
  manifest.categories = [candidate.category]; manifest.installation.executionValidated = false;
  return manifest;
}
test('六个审计适配器精确绑定来源、commit、目录，不匹配其他版本或漫画', () => {
  assert.equal(visualBatch.length, 6);
  for (const candidate of visualBatch) {
    assert.equal(batchForSource(candidate.repository, candidate.commit, candidate.root), candidate);
    assert.equal(batchForSource(candidate.repository, '0'.repeat(40), candidate.root), undefined);
    assert.equal(batchForSource(candidate.repository, candidate.commit, 'skills/baoyu-comic'), undefined);
  }
});
test('动态参数和比例遵循各 Skill，通用 Compiler 不混入保真/强度控件', () => {
  const signatures = new Set<string>();
  for (const candidate of visualBatch) {
    const manifest = manifestFor(candidate), project = presentationProject(manifest);
    const draft = applySkillParameters(project.draft, manifest), compiled = compileCodexTask(project, manifest, draft);
    signatures.add(manifest.parameters.map(parameter => parameter.id).join(','));
    assert.equal(compiled.settings.aspect_ratio, draft.parameters!.output_ratio);
    assert.equal(compiled.settings.size, 'auto');
    assert.deepEqual(compiled.extensions, draft.parameters);
    assert.ok(!manifest.parameters.some(parameter => ['fidelity','styleStrength','textAmount'].includes(parameter.id)));
    assert.match(compiled.request.requirements.join('\n'), /内置 imagegen/);
    assert.equal(compiled.request.prompt, draft.prompt);
  }
  assert.equal(signatures.size, 6);
});
test('社媒确认选项支持 2/3/4 图，不能错误锁成固定两张', () => {
  const manifest = manifestFor(visualBatch[1]), project = presentationProject(manifest);
  for (const count of [2,3,4]) {
    project.draft.parameters = { output_count: String(count) };
    const draft = applySkillParameters(project.draft, manifest), task = compileCodexTask(project, manifest, draft);
    assert.equal(task.settings.output_count, count);
    assert.match(task.request.requirements.join('\n'), new RegExp(`生成 ${count} 张`));
    assert.match(task.request.requirements.join('\n'), /任务工作目录内/);
  }
});

test('Baoyu task-local preferences follow the selected language instead of forcing Chinese', () => {
  for (const candidate of visualBatch.filter(candidate => candidate.name.startsWith('baoyu-'))) {
    const manifest = manifestFor(candidate), project = presentationProject(manifest);
    project.draft = applySkillParameters(project.draft, manifest);
    project.draft.parameters = { ...project.draft.parameters, lang: 'en' };
    project.draft.requirements = 'All visible text must be English; no Chinese characters.';
    const compiled = compileCodexTask(project, manifest);
    const preference = compiled.request.requirements.find(requirement => requirement.startsWith('首次偏好：'))!;
    assert.doesNotMatch(preference, /中文/);
    assert.match(preference, candidate.name === 'baoyu-xhs-images' ? /本任务用户指定语言/ : /英文/);
    assert.match(preference, /不得改写用户级/);
    assert.equal(manifest.parameters.find(parameter => parameter.id === 'lang')?.default, candidate.name === 'baoyu-xhs-images' ? undefined : 'zh');
  }
});
test('单张展示任务不能错误覆盖成组 Skill 的最小数量', () => {
  assert.throws(() => createShowcaseProjects(manifestFor(visualBatch[1])), /成组出图/);
  assert.equal(createShowcaseProjects(manifestFor(visualBatch[0])).length, 2);
});
test('仓库案例不冒充实测；待验证只在真实同版本成功后变为可用', () => {
  const manifest = manifestFor(visualBatch[0]);
  manifest.examples = [{ id: 'repo', label: '仓库案例', source: 'declared', verified: false, beforeRef: null, imageRef: 'data:image/webp;base64,AAAA', sha256: 'a'.repeat(64), sourceUrl: 'https://github.com/JimLiu/baoyu-skills/blob/' + manifest.version.commit + '/sample.webp', skillCommit: manifest.version.commit! }];
  const initial = skillPresentation(manifest);
  assert.equal(initial.displayStatus, '待验证'); assert.equal(initial.examples[0].verified, false);
  assert.equal(initial.examples[0].sourceUrl, manifest.examples[0].sourceUrl);
  const project = presentationProject(manifest); project.generations[0].codex!.result!.finalPrompt = '实际执行 Prompt';
  const succeeded = skillPresentation(manifest, {}, [project]);
  assert.equal(succeeded.displayStatus, '可用');
  assert.equal(succeeded.examples.find(example => example.verified)?.finalPrompt, '实际执行 Prompt');
  project.generations[0].status = 'failed'; assert.equal(skillPresentation(manifest, {}, [project]).displayStatus, '待验证');
  assert.equal(skillPresentation(manifestFor(visualBatch[1])).displayStatus, '待验证');
});
test('混合封面+案例保留来源和 Hash；版本改变后不借用内嵌数据图', () => {
  const manifest = manifestFor(visualBatch[0]);
  manifest.examples = ['one','two'].map(id => ({ id, label: id, source: 'declared' as const, verified: false, beforeRef: null, imageRef: 'data:image/webp;base64,AAAA', sha256: id === 'one' ? 'a'.repeat(64) : 'c'.repeat(64) }));
  const project = presentationProject(manifest);
  project.generations[0].codex!.compiledTask!.showcase = { schema:1, setId:crypto.randomUUID(), role:'case', ordinal:1, label:'本机实测', purpose:'流程信息图' };
  const before = JSON.stringify(manifest), view = skillPresentation(manifest, {}, [project]);
  assert.equal(view.examples.length, 2); assert.equal(view.featuredExample?.exampleSource, 'repository');
  assert.equal(view.examples.filter(example => example.verified).length, 1);
  assert.equal(JSON.stringify(manifest), before);
  manifest.version.commit = '0'.repeat(40);
  assert.equal(skillPresentation(manifest).examples.length, 0);
});
test('中文摘要、友好名称和分类仅在展示层改变，不覆写原始 Skill 文本', () => {
  for (const candidate of visualBatch) {
    const manifest = manifestFor(candidate), before = JSON.stringify(manifest), view = skillPresentation(manifest);
    assert.equal(view.displayName, candidate.displayName); assert.equal(view.displayDescription, candidate.description);
    assert.ok(view.displayDescription.length <= 40); assert.deepEqual(view.displayCategory, [candidate.name === 'baoyu-cover-image' ? '封面设计' : ['baoyu-infographic', 'baoyu-xhs-images'].includes(candidate.name) ? '艺术插画' : '海报设计']);
    assert.equal(JSON.stringify(manifest), before);
  }
});
test('大型仓库案例不随流式任务重复传输，保留版本和 Hash 并可回查原图', () => {
  const manifest = manifestFor(visualBatch[3]);
  manifest.examples = [{id:'large',label:'仓库案例',source:'declared',verified:false,imageRef:'data:image/png;base64,'+'A'.repeat(8*1024*1024),beforeRef:null,sha256:'c'.repeat(64),sourceUrl:'https://github.com/author/repo/blob/commit/case.png'}];
  const before = JSON.stringify(manifest), project = presentationProject(manifest);
  const compiled = compileCodexTask(project, manifest);
  assert.ok(JSON.stringify(compiled).length < 50000);
  assert.equal(compiled.manifest!.examples[0].imageRef, 'asset:skill-example:'+'c'.repeat(64));
  assert.equal(compiled.manifest!.examples[0].sourceUrl, manifest.examples[0].sourceUrl);
  assert.equal(compiled.manifest!.version.commit, manifest.version.commit);
  assert.equal(skillPresentation(executionManifest(manifest), declaredExampleAssets(manifest)).featuredExample?.image, manifest.examples[0].imageRef);
  assert.equal(JSON.stringify(manifest), before);
});
