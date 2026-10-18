import test from 'node:test';
import assert from 'node:assert/strict';
import { createShowcaseProjects, latestShowcaseProjects } from '../../src/application/showcase.ts';
import { compileCodexTask } from '../../src/application/codexTaskCompiler.ts';
import { skillPresentation } from '../../src/application/presentation.ts';
import { adaptSkill } from '../../bridge/protocol/skillProfiles.ts';
import { visualBatch } from '../../bridge/protocol/visualBatch.ts';
import { applySkillParameters } from '../../src/application/skillViews.ts';
import { showcaseBriefs } from '../../src/application/showcaseBriefs.ts';
// @ts-expect-error The Bridge is plain ESM; this cross-layer test exercises its runtime validator.
import { validatePayload } from '../../bridge/server/workspace.mjs';
import { presentationManifest, presentationProject } from '../fixtures/presentation.ts';

test('默认封面+单案例是两个独立项目与 Prompt，不修改 Manifest', () => {
  const manifest = adaptSkill(presentationManifest()), before = JSON.stringify(manifest);
  const projects = createShowcaseProjects(manifest);
  assert.equal(projects.length, 2); assert.equal(new Set(projects.map(project => project.id)).size, 2);
  assert.equal(new Set(projects.map(project => project.showcase?.setId)).size, 1);
  assert.equal(new Set(projects.map(project => project.draft.prompt)).size, 2);
  assert.deepEqual(projects.map(project => project.showcase?.role), ['cover', 'case']);
  assert.equal(JSON.stringify(manifest), before);
  for (const project of projects) { assert.equal(project.draft.count, 1); assert.equal(project.draft.format, 'PNG'); assert.equal(project.generations.length, 0); }
});

test('两真实 Skill 保留不同展示配方，专用画布统一为竖向 3:4', () => {
  const imagegen = createShowcaseProjects(adaptSkill(presentationManifest()));
  const zine = createShowcaseProjects(presentationManifest('gc-minimal-zine-poster-v0-3'));
  assert.equal(imagegen[0].draft.ratio, '3:4'); assert.equal(zine[0].draft.ratio, '3:4');
  assert.match(imagegen[1].draft.prompt, /产品摄影/); assert.match(zine[1].draft.prompt, /lower-left-float/);
  assert.notEqual(zine[0].draft.prompt, zine[1].draft.prompt);
  for (const project of [...imagegen, ...zine]) {
    assert.doesNotMatch(project.draft.prompt, /3:2|4:5|横向/);
    assert.match(project.draft.prompt, /3:4/);
  }
});

test('所有可单张生成的适配器都生成唯一 3:4 展示画布，不改 Skill 源参数', () => {
  for (const candidate of visualBatch.filter(candidate => candidate.name !== 'baoyu-xhs-images')) {
    const skill = presentationManifest(candidate.name);
    skill.parameters = structuredClone(candidate.parameters);
    skill.source = { ...skill.source, type: 'github', repository: candidate.repository, skillRoot: candidate.root };
    skill.version.commit = candidate.commit;
    const before = JSON.stringify(skill);
    for (const project of createShowcaseProjects(skill)) {
      const task = compileCodexTask(project, skill);
      assert.equal(task.settings.aspect_ratio, '3:4'); assert.equal(task.settings.size, '1536 × 2048');
      assert.equal(task.extensions.output_ratio, undefined); assert.equal(task.extensions.output_size, undefined);
      assert.match(task.instruction, /原生构图为竖向 3:4/);
      assert.match(task.instruction, /不得通过代码改尺寸/);
      assert.doesNotThrow(() => validatePayload(task, []));
      if (candidate.name === 'dreamcore-collage-poster') {
        assert.equal(task.showcase?.canvas?.composition, 'recompose');
        assert.equal(task.showcase?.canvas?.source_parameters.output_ratio, '3:5');
        assert.equal(project.draft.parameters?.output_ratio, '3:5');
        assert.match(task.instruction, /原 Skill 未声明此比例/);
        assert.doesNotMatch(task.instruction, /3:5/);
      } else assert.equal(task.showcase?.canvas?.composition, 'native');
    }
    assert.equal(JSON.stringify(skill), before);
  }
});

test('专用展示草稿被参数面板重算后，Compiler 仍保持已持久化的 3:4 契约', () => {
  const skill = adaptSkill(presentationManifest()), project = createShowcaseProjects(skill)[0];
  const refreshed = applySkillParameters({ ...project.draft, parameters: { ...project.draft.parameters, output_ratio: '1:1' } }, skill);
  assert.notEqual(refreshed.ratio, '3:4');
  const before = JSON.stringify(project), task = compileCodexTask(project, skill, refreshed);
  assert.equal(task.settings.aspect_ratio, '3:4'); assert.equal(task.settings.size, '1536 × 2048');
  assert.equal(JSON.stringify(project), before);
});

test('旧展示任务和普通用户项目保留历史尺寸，不隐式升级新契约', () => {
  const skill = adaptSkill(presentationManifest()), project = createShowcaseProjects(skill)[0];
  delete project.showcase!.canvas;
  project.draft.parameters = { ...project.draft.parameters, output_ratio: '16:9', output_size: '1536 × 864' };
  project.draft = applySkillParameters(project.draft, skill);
  for (const showcase of [project.showcase, undefined]) {
    project.showcase = showcase;
    const task = compileCodexTask(project, skill);
    assert.equal(task.settings.aspect_ratio, '16:9'); assert.equal(task.settings.size, '1536 × 864');
    assert.equal(task.extensions.output_ratio, '16:9'); assert.equal(task.extensions.output_size, '1536 × 864');
    assert.doesNotMatch(task.instruction, /展示画布契约/);
    assert.doesNotThrow(() => validatePayload(task, []));
  }
});

test('未知 Skill 走通用规划，不硬编码成 imagegen', () => {
  const skill = presentationManifest('other-genuine-visual-skill');
  for (const project of createShowcaseProjects(skill)) {
    const task = compileCodexTask(project, skill);
    assert.equal(task.skill.name, skill.name); assert.equal(task.skill.sourcePath, skill.source.path);
    assert.ok(task.showcase?.purpose); assert.match(task.request.prompt, /Skill/);
    assert.equal(task.settings.output_count, 1); assert.equal(task.showcase?.schema, 1);
    assert.match(task.instruction, /一次内置 image_gen/); assert.match(task.instruction, /禁止使用 OpenAI API/);
    assert.ok(!('showcase' in task.extensions));
  }
});

test('非可用、演示、未安装和必须提供参考图的 Skill 不自动消耗生成', () => {
  for (const mutate of [
    (skill: ReturnType<typeof presentationManifest>) => { skill.runtime.status = 'unavailable'; },
    (skill: ReturnType<typeof presentationManifest>) => { skill.installation.installed = false; },
    (skill: ReturnType<typeof presentationManifest>) => { skill.source.type = 'demo'; },
    (skill: ReturnType<typeof presentationManifest>) => { skill.inputs = [{ id: 'photo', label: '原图', type: '图片', required: true }]; },
  ]) { const skill = presentationManifest(); mutate(skill); assert.throws(() => createShowcaseProjects(skill)); }
});

test('当前案例集严格绑定安装身份、版本、指纹和 bundle', () => {
  const skill = presentationManifest(), previous = createShowcaseProjects(skill), next = createShowcaseProjects(skill);
  next.forEach(project => { project.createdAt = '2030-01-01T00:00:00.000Z'; });
  assert.deepEqual(latestShowcaseProjects(skill, [...previous, ...next]).map(project => project.id), next.map(project => project.id));
  const updated = structuredClone(skill); updated.version.bundle = 'new';
  assert.equal(latestShowcaseProjects(updated, next).length, 0);
  updated.version.bundle = skill.version.bundle; updated.source.fingerprint = 'new';
  assert.equal(latestShowcaseProjects(updated, next).length, 0);
});

test('已校验专用封面优先，不再随最新用户作品变化', () => {
  const skill = presentationManifest(), cover = presentationProject(skill, '/artwork/category-photo.png', 'showcase');
  const spec = createShowcaseProjects(skill)[0].showcase!;
  cover.showcase = spec; cover.generations[0].codex!.compiledTask!.showcase = spec;
  cover.generations[0].codex!.result!.finalPrompt = '真正执行的图像 Prompt';
  const unrelated = presentationProject(skill, '/artwork/result-v4.png', 'user-project'); unrelated.generations[0].startedAt += 10000;
  const view = skillPresentation(skill, {}, [unrelated, cover]);
  assert.equal(view.featuredExample?.exampleSource, 'generated_showcase'); assert.equal(view.featuredExample?.image, '/artwork/category-photo.png');
  assert.equal(view.featuredExample?.purpose, spec.purpose); assert.equal(view.featuredExample?.finalPrompt, '真正执行的图像 Prompt');
});

test('生成失败的封面不能取代此前通过校验的真实封面', () => {
  const skill = presentationManifest(), original = presentationProject(skill), failed = presentationProject(skill, 'failed.png', 'failed');
  failed.showcase = createShowcaseProjects(skill)[0].showcase; failed.generations[0].codex!.compiledTask!.showcase = failed.showcase;
  failed.generations[0].status = 'failed';
  assert.equal(skillPresentation(skill, {}, [original, failed]).featuredExample?.image, original.generations[0].versions[0].image);
});

test('案例带用途与独立可追溯记录，不冒充作者来源', () => {
  const skill = presentationManifest(), cases = createShowcaseProjects(skill).map((planned, i) => {
    const project = presentationProject(skill, '/artwork/result-v4.png', 'showcase-' + i);
    project.showcase = planned.showcase; project.generations[0].codex!.compiledTask!.showcase = planned.showcase; return project;
  });
  const view = skillPresentation(skill, {}, cases);
  assert.equal(view.examples.length, 2); assert.deepEqual(view.examples.map(example => example.ordinal), [0, 1]);
  for (const example of view.examples) { assert.equal(example.exampleSource, 'generated_showcase'); assert.ok(example.purpose); assert.ok(example.sha256); assert.ok(example.taskId); }
});

test('批准的单张 XHS 补充案例不改变普通成组参数或重复生成封面', () => {
  const candidate = visualBatch.find(item => item.name === 'baoyu-xhs-images')!;
  const skill = presentationManifest(candidate.name);
  skill.parameters = structuredClone(candidate.parameters);
  skill.source = { ...skill.source, type: 'github', repository: candidate.repository, skillRoot: candidate.root };
  skill.version.commit = candidate.commit;
  const before = JSON.stringify(skill);
  const project = createShowcaseProjects(skill, { briefs: showcaseBriefs[skill.name], singleCardApproved: true })[3];
  const task = compileCodexTask(project, skill);
  assert.equal(task.showcase?.ordinal, 3); assert.equal(task.settings.output_count, 1);
  assert.equal(task.extensions.output_count, undefined);
  assert.equal(task.showcase?.canvas?.source_parameters.output_count, '2');
  assert.doesNotThrow(() => validatePayload(task, []));
  assert.match(task.request.requirements.join('\n'), /只制作本条具体主题的一张独立成品/);
  assert.doesNotMatch(task.request.requirements.join('\n'), /先生成第一张封面/);
  assert.equal(JSON.stringify(skill), before);
  assert.throws(() => createShowcaseProjects(skill), /成组/);
});

test('历史第二第三案例不重新进入单案例展示，封面和首案例保持不变', () => {
  const skill = presentationManifest('pixel-style-poster-skill');
  skill.examples = ['cover', 'case-two'].map(id => ({ id, imageRef: `asset:${id}`, beforeRef: null, label: id, source: 'declared' as const, verified: false }));
  const assets = { 'asset:cover': 'blob:cover', 'asset:case-two': 'blob:case-two' };
  const old = presentationProject(skill, 'blob:case-one', 'old-case');
  old.generations[0].codex!.compiledTask!.showcase = { schema: 1, setId: crypto.randomUUID(), role: 'case', ordinal: 1, label: 'Existing case', purpose: 'Existing purpose' };
  const before = skillPresentation(skill, assets, [old]);
  const added = presentationProject(skill, 'blob:case-three', 'new-case');
  added.generations[0].codex!.compiledTask!.showcase = { schema: 1, setId: crypto.randomUUID(), role: 'case', ordinal: 3, label: 'Historical third case', purpose: 'Historical purpose' };
  const after = skillPresentation(skill, assets, [old, added]);
  assert.equal(after.examples.length, 2);
  assert.deepEqual(after.examples, before.examples);
  assert.equal(after.featuredExample?.id, before.featuredExample?.id);
});

test('名称与说明空缺时仍有非空显示，不改源 Manifest', () => {
  const skill = presentationManifest(''); skill.description = '';
  const before = JSON.stringify(skill), view = skillPresentation(skill);
  assert.ok(view.displayName.trim()); assert.ok(view.displayDescription.trim());
  assert.equal(JSON.stringify(skill), before);
});
