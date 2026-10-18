import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCodexTask } from '../../src/application/codexTaskCompiler.ts';
import { defaultDraft } from '../../src/fixtures/demoGenerations.ts';
import { demoManifests } from '../../src/application/skillViews.ts';
import type { CanvasProject, Draft, ReferenceRole } from '../../src/domain/types';
const skill = demoManifests[0];
const draft = { ...structuredClone(defaultDraft), prompt: '中文“留白” / \\ 路径\n第二行', references: [], requirements: '保留主体\n黑白配色' };
const project: CanvasProject = { id: crypto.randomUUID(), draft, title: '测试', createdAt: '', updatedAt: '', skillName: skill.name, status: 'draft', generations: [], thumbnail: null };
test('纯文本任务：机器数据与指令分离，不猜路径', () => {
  const task = compileCodexTask(project, skill, draft);
  assert.equal(task.projectId, project.id); assert.equal(task.skill.path, null); assert.equal(task.images.length, 0);
  assert.notEqual(task.instruction, JSON.stringify(task)); assert.equal(task.request.prompt, draft.prompt);
  assert.deepEqual(task.request.requirements, ['保留主体', '黑白配色']); assert.ok(task.instruction.includes('禁止使用 OpenAI API Key'));
});
for (const role of ['edit_target', 'style_reference', 'subject_reference', 'composition_reference', 'brand_asset'] as ReferenceRole[]) test(`单参考图角色 ${role} 与保留要求`, () => {
  const task = compileCodexTask(project, skill, { ...draft, references: [{ id: crypto.randomUUID(), name: '中文.png', role, assetId: 'asset:ref', url: 'blob:private', mime: 'image/png' }] });
  assert.equal(task.images[0].role, role); assert.equal(task.images[0].path, null); assert.equal(task.images[0].preservation, ['edit_target', 'subject_reference'].includes(role) ? 'high' : undefined); assert.ok(!task.instruction.includes('blob:private'));
});
test('多图角色顺序和独立任务 ID', () => {
  const input: Draft = { ...draft, references: ['edit_target', 'style_reference'].map(role => ({ id: crypto.randomUUID(), name: role + '.png', url: '', role: role as ReferenceRole })) };
  const task = compileCodexTask(project, skill, input);
  assert.deepEqual(task.images.map(image => image.role), ['edit_target', 'style_reference']); assert.notEqual(task.taskId, compileCodexTask(project, skill, input).taskId);
});
test('不同 Skill 动态参数规范化、不破坏核心 Schema', () => {
  const local = { ...skill, parameters: [{ id: 'strength', label: '强度', type: 'range' as const, min: 0, max: 100, step: 1, default: 65 }, { id: 'title', label: '标题', type: 'text' as const, default: '' }] };
  const task = compileCodexTask(project, local, { ...draft, parameters: { strength: 200, title: '"测试"\n\\', unknown: 1 } });
  assert.deepEqual(task.extensions, { strength: 100, title: '"测试"\n\\' }); assert.equal(task.settings.output_count, draft.count);
});
test('空 Prompt 被拒绝，诊断指令固定且禁止工具', () => {
  assert.throws(() => compileCodexTask(project, skill, { ...draft, prompt: ' ' }));
  const task = compileCodexTask(project, skill, { ...draft, prompt: '' }, 'bridge_test');
  assert.ok(task.instruction.includes('SKILL_CANVAS_CODEX_BRIDGE_OK')); assert.ok(task.instruction.includes('不要使用工具'));
});

test('项目冻结 Skill 快照：更新安装版本后编译仍使用旧版本、commit、资源和参数', () => {
  const pinned = structuredClone(skill);
  pinned.version.installed = '1.0.0'; pinned.version.commit = 'a'.repeat(40); pinned.version.bundle = 'bundle-v1';
  pinned.source.path = '/immutable/versions/v1/SKILL.md'; pinned.instructions = 'Pinned V1 instructions';
  pinned.parameters = [{ id: 'old_parameter', label: '原参数', type: 'number', min: 0, max: 10, step: 1, default: 3 }];
  const updated = structuredClone(pinned);
  updated.version.installed = '2.0.0'; updated.version.commit = 'b'.repeat(40); updated.version.bundle = 'bundle-v2';
  updated.source.path = '/immutable/versions/v2/SKILL.md'; updated.instructions = 'New V2 instructions';
  updated.parameters = [{ id: 'new_parameter', label: '新参数', type: 'boolean', default: true }];
  const task = compileCodexTask({ ...project, skillSnapshot: pinned }, updated, { ...draft, parameters: { old_parameter: 5, new_parameter: false } });
  assert.equal(task.skill.version, '1.0.0'); assert.equal(task.skill.commit, 'a'.repeat(40)); assert.equal(task.skill.bundle, 'bundle-v1');
  assert.equal(task.skill.sourcePath, pinned.source.path); assert.equal(task.skill.instructions, pinned.instructions);
  assert.deepEqual(task.extensions, { old_parameter: 5 }); assert.equal(task.manifest?.version.installed, '1.0.0');
  pinned.instructions = 'Later mutation'; assert.notEqual(task.manifest?.instructions, pinned.instructions);
});

test('新项目和明确切换 Skill 不继承其它 Skill 的旧版本快照', () => {
  const updated = structuredClone(skill); updated.version.installed = '2.0.0'; updated.version.commit = 'b'.repeat(40);
  assert.equal(compileCodexTask(project, updated, draft).skill.version, '2.0.0');
  const other = structuredClone(skill); other.id = 'another-skill';
  assert.equal(compileCodexTask({ ...project, skillSnapshot: other }, updated, draft).skill.commit, 'b'.repeat(40));
});
