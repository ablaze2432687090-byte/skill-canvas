import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectStore } from '../../bridge/server/projects.mjs';
import { TaskWorkspaces, digest, validatePayload } from '../../bridge/server/workspace.mjs';
import { TaskManager } from '../../bridge/server/tasks.mjs';
import { adaptSkill } from '../../bridge/protocol/skillProfiles.ts';

const root = path.resolve('work/phase4/unit'); await mkdir(root, { recursive: true });
const png = await readFile('public/artwork/category-photo.png');
const payload = (projectId = randomUUID()) => ({ schema: 1, taskId: randomUUID(), projectId, action: 'generate_image', skill: { id: 'test', name: 'fixture-only', instructions: 'Fixture', fingerprint: 'hash', version: '1', path: null }, request: { prompt: 'test', requirements: [] }, images: [], settings: { aspect_ratio: '1:1', size: '1024 × 1024', output_count: 1 }, extensions: {}, output: { format: 'png' } });
class FakeClient extends EventEmitter {
  calls = [];
  async start() {}
  async request(method, params) {
    this.calls.push({ method, params });
    if (method.startsWith('thread/') && method !== 'thread/read') return { thread: { id: params.threadId || randomUUID() }, model: 'fixture' };
    if (method === 'turn/start') return { turn: { id: randomUUID() } };
    if (method === 'thread/read') return { thread: { turns: [] } };
    return {};
  }
}
async function setup(t) {
  const directory = await mkdtemp(path.join(root, 'test-')), projects = new ProjectStore(path.join(directory, 'Projects')), workspaces = new TaskWorkspaces(path.join(directory, 'tasks'));
  const manager = new TaskManager({ projects, workspaces, client: new FakeClient() }); await manager.boot;
  manager.capabilities = async () => ({ automaticImageGeneration: true }); manager.resolveSkill = async () => 'fixture/SKILL.md';
  t.after(async () => { await Promise.allSettled([...projects.queues.values(), ...workspaces.queues.values()]); if (!directory.startsWith(root + path.sep)) throw new Error('unsafe cleanup'); await rm(directory, { recursive: true, force: true }); });
  return { manager, projects, workspaces };
}
async function running(manager, id) {
  for (let i = 0; i < 200; i++) { const task = manager.get(id); if (task.stage === 'running') return task; if (['failed', 'waiting'].includes(task.stage)) throw new Error(JSON.stringify(task.error)); await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('fixture timeout');
}
async function complete(manager, input = payload(), refs = []) {
  const handle = await manager.create(input, refs), task = await running(manager, handle.taskId), target = path.join(task.workspace, 'output/result.png');
  await writeFile(target, png); task.sawImageGeneration = true;
  await manager.complete(task, { status: 'completed', items: [{ type: 'agentMessage', text: JSON.stringify({ status: 'completed', finalPrompt: 'Actual image prompt', outputs: [{ id: 'image', path: target, format: 'png' }] }) }] });
  return task;
}
test('正式 PNG 原字节、Hash、版本编号、元数据与清理后恢复', async t => {
  const { manager, projects, workspaces } = await setup(t), first = await complete(manager);
  assert.equal(first.result.version, 1); assert.ok(first.result.outputs[0].path.includes(path.join('versions', 'V1')));
  assert.equal(first.result.outputs[0].sha256, digest(png)); assert.equal(first.result.metadata.threadId, first.threadId);
  await manager.remove(first.taskId);
  assert.deepEqual(await manager.outputBytes(first, first.result.outputs[0]), png);
  const restored = new TaskManager({ projects, workspaces, client: new FakeClient() }); await restored.boot;
  assert.equal(restored.get(first.taskId).threadId, first.threadId);
  assert.deepEqual(await restored.outputBytes(restored.get(first.taskId), first.result.outputs[0]), png);
  assert.equal((await restored.capabilities()).automaticImageGeneration, true);
  restored.capabilities = async () => ({ automaticImageGeneration: true }); restored.resolveSkill = async () => 'fixture/SKILL.md';
  const revision = payload(first.projectId); revision.revision = { baseTaskId: first.taskId, baseOutputId: 'image', instruction: 'Edit after restart and cleanup' };
  const second = await complete(restored, revision); assert.equal(second.threadId, first.threadId); assert.equal(second.result.version, 2);
});

test('专用案例元数据随正式任务落盘，清理临时目录后仍可恢复', async t => {
  const { manager, projects, workspaces } = await setup(t), input = payload();
  input.showcase = { schema: 1, setId: randomUUID(), role: 'cover', ordinal: 0, label: '测试封面', purpose: '受控测试，非真实生成证据' };
  const completed = await complete(manager, input);
  await manager.remove(completed.taskId);
  const restored = new TaskManager({ projects, workspaces, client: new FakeClient() }); await restored.boot;
  assert.deepEqual(restored.public(restored.get(completed.taskId)).compiledTask.showcase, input.showcase);
  assert.deepEqual(await restored.outputBytes(restored.get(completed.taskId), completed.result.outputs[0]), png);
});

test('失败案例重试保留用途、Skill 身份与同 Thread，不覆盖失败记录', async t => {
  const { manager } = await setup(t), input = payload();
  input.showcase = { schema: 1, setId: randomUUID(), role: 'case', ordinal: 1, label: '应用案例', purpose: '受控测试' };
  const first = await manager.create(input, []), failed = await running(manager, first.taskId);
  await manager.update(failed, { stage: 'failed', error: { code: 'TURN_FAILED', message: 'Controlled failure' } });
  const retry = await manager.retry(failed.taskId), next = await running(manager, retry.taskId);
  assert.notEqual(next.taskId, failed.taskId); assert.equal(next.threadId, failed.threadId);
  assert.deepEqual(next.payload.showcase, input.showcase); assert.equal(next.payload.skill.id, input.skill.id);
  assert.equal(failed.stage, 'failed'); assert.equal(next.payload.retryOfTaskId, failed.taskId);
});

test('专用案例 Schema 拒绝错误身份、角色、范围和多输出数量', () => {
  const task = payload(); task.showcase = { schema: 1, setId: randomUUID(), role: 'cover', ordinal: 0, label: '封面', purpose: '用途' };
  validatePayload(task, []);
  for (const mutate of [
    task => { task.showcase.setId = '../bad'; }, task => { task.showcase.ordinal = 4; },
    task => { task.showcase.role = 'case'; }, task => { task.showcase.label = 'x'.repeat(501); },
    task => { task.settings.output_count = 2; }, task => { task.action = 'bridge_test'; },
  ]) { const changed = structuredClone(task); mutate(changed); assert.throws(() => validatePayload(changed, [])); }
});

test('旧大图案例任务重试压缩展示快照，保留来源、同 Thread 和原失败记录', async t => {
  const { manager, projects } = await setup(t), input = payload();
  const artwork = 'data:image/png;base64,' + 'A'.repeat(8_000_000);
  const example = { id: 'repository-case', imageRef: artwork, sha256: 'a'.repeat(64), sourceUrl: 'https://example.org/fixed-commit/case.png', skillCommit: 'fixed-commit' };
  input.manifest = { name: 'fixture-only', examples: [example] };
  const first = await manager.create(input, []), failed = await running(manager, first.taskId);
  assert.equal(failed.payload.manifest.examples[0].imageRef, `asset:skill-example:${example.sha256}`);
  assert.equal(input.manifest.examples[0].imageRef, artwork);
  // Simulate an older on-disk task, created before the compact snapshot boundary.
  failed.payload.manifest.examples[0].imageRef = artwork;
  await manager.update(failed, { stage: 'failed', error: { code: 'TURN_FAILED', message: 'Controlled legacy failure' } });
  const retry = await manager.retry(failed.taskId), next = await running(manager, retry.taskId);
  assert.equal(next.threadId, failed.threadId);
  assert.notEqual(next.turnId, failed.turnId);
  assert.equal(next.payload.retryOfTaskId, failed.taskId);
  assert.deepEqual(next.payload.manifest.examples[0], { ...example, imageRef: `asset:skill-example:${example.sha256}`, beforeRef: undefined });
  assert.ok(JSON.stringify(manager.public(next)).length < 100_000);
  assert.equal(failed.payload.manifest.examples[0].imageRef, artwork);
  const saved = await projects.read(failed.projectId);
  assert.equal(saved.tasks.find(task => task.taskId === failed.taskId).payload.manifest.examples[0].imageRef, artwork);
  await manager.fail(next, new Error('fixture cleanup'));
});
test('同 Thread 连续修改、明确的历史底图与每版独立参数', async t => {
  const { manager } = await setup(t), first = await complete(manager), next = payload(first.projectId);
  next.revision = { baseTaskId: first.taskId, baseOutputId: 'image', instruction: '仅调整背景' }; next.extensions = { palette: 'blue' };
  const second = await complete(manager, next);
  assert.equal(second.result.version, 2); assert.equal(second.threadId, first.threadId); assert.notEqual(second.turnId, first.turnId);
  assert.equal(second.payload.images[0].origin, 'base_version'); assert.equal(second.payload.images[0].role, 'edit_target');
  assert.deepEqual(await readFile(second.payload.images[0].path), png);
  assert.ok(second.instruction.includes('仅调整背景')); assert.equal(first.payload.extensions.palette, undefined);
});
test('跨项目底图、损坏 PNG、丢失原图均拒绝', async t => {
  const { manager } = await setup(t), first = await complete(manager), next = payload();
  next.revision = { baseTaskId: first.taskId, baseOutputId: 'image', instruction: 'edit' };
  await assert.rejects(manager.create(next, []), /不属于当前项目/);
  const output = first.result.outputs[0]; await writeFile(output.path, 'broken');
  await assert.rejects(manager.outputBytes(first, output), /Hash/);
  await rm(output.path); await assert.rejects(manager.outputBytes(first, output), /不存在/);
});
test('失败记录不覆盖、重试使用正式参考图并创建新 Turn', async t => {
  const { manager, projects } = await setup(t), input = payload(), id = randomUUID();
  input.images = [{ id, name: 'reference.png', role: 'subject_reference', mime: 'image/png' }];
  const handle = await manager.create(input, [{ id, data: png.toString('base64') }]), first = await running(manager, handle.taskId);
  await manager.fail(first, new Error('ImageGen failed')); const oldTurn = first.turnId;
  await manager.remove(first.taskId);
  const retried = await manager.retry(first.taskId), second = await running(manager, retried.taskId);
  assert.notEqual(second.taskId, first.taskId); assert.notEqual(second.turnId, oldTurn); assert.equal(second.threadId, first.threadId);
  assert.equal(second.payload.retryOfTaskId, first.taskId); assert.deepEqual(await readFile(second.payload.images[0].path), png);
  assert.equal((await projects.read(first.projectId)).tasks.find(task => task.taskId === first.taskId).stage, 'failed');
  await manager.fail(second, new Error('fixture cleanup'));
});
test('多角色参考图正式保存、文件缺失明确报错', async t => {
  const { manager, projects } = await setup(t), input = payload();
  input.images = ['style_reference', 'subject_reference', 'composition_reference'].map(role => ({ id: randomUUID(), role, name: role + '.png', mime: 'image/png' }));
  const task = await complete(manager, input, input.images.map(image => ({ id: image.id, data: png.toString('base64') })));
  const record = (await projects.read(task.projectId)).tasks[0];
  assert.deepEqual(record.payload.images.map(image => image.role), input.images.map(image => image.role));
  assert.ok(record.payload.images.every(image => image.sha256 === digest(png)));
  await rm(record.payload.images[0].path);
  await assert.rejects(manager.referenceBytes(task.taskId, input.images[0].id), /不存在/);
});
test('版本发布幂等且磁盘失败不回报生成成功', async t => {
  const { manager, projects } = await setup(t), first = await complete(manager);
  const again = await projects.publish(first, first.result); assert.equal(again.version, 1);
  assert.equal((await projects.read(first.projectId)).versions.length, 1);
  projects.publish = async () => { throw new Error('disk full'); };
  await assert.rejects(complete(manager, payload(first.projectId)), /disk full/);
  assert.notEqual([...manager.tasks.values()].at(-1).stage, 'completed');
});
test('续改 Schema 拒绝错误身份；适配器不改写其它 Skill', () => {
  const input = payload(); input.revision = { baseTaskId: '../outside', baseOutputId: 'image', instruction: '' }; assert.throws(() => validatePayload(input, []));
  const other = { name: 'other-skill', parameters: [{ id: 'own-parameter' }] }; assert.equal(adaptSkill(other), other);
  const formal = adaptSkill({ name: 'imagegen', runtime: {}, installation: {} });
  assert.ok(formal.parameters.some(parameter => parameter.id === 'preservation'));
  assert.equal(formal.outputs[0].format, 'PNG');
});

test('已发布版本优先于崩溃时残留的 running 快照', async t => {
  const { manager, projects, workspaces } = await setup(t), first = await complete(manager);
  await workspaces.save({ ...first, stage: 'running', result: undefined });
  const restored = new TaskManager({ projects, workspaces, client: new FakeClient() }); await restored.boot;
  assert.equal(restored.get(first.taskId).stage, 'completed'); assert.equal(restored.get(first.taskId).result.version, 1);
  assert.equal(restored.client.calls.length, 0);
});
