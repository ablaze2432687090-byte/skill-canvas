import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TaskManager } from '../../bridge/server/tasks.mjs';
import { TaskWorkspaces, digest } from '../../bridge/server/workspace.mjs';
const root = path.resolve('work/brand-skills/unit');
await mkdir(root, { recursive: true });
const png = await readFile('public/artwork/category-photo.png');
async function fixture(t) {
  const directory = await mkdtemp(path.join(root, 'delivery-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const taskId = randomUUID(), threadId = randomUUID(), turnId = randomUUID();
  const spaces = new TaskWorkspaces(path.join(directory, 'tasks'));
  const workspace = path.join(spaces.root, taskId);
  await mkdir(path.join(workspace, 'output'), { recursive: true });
  const cache = path.join(directory, 'cache'), imageId = 'exec-' + randomUUID();
  const source = path.join(cache, threadId, imageId + '.png');
  await mkdir(path.dirname(source), { recursive: true }); await writeFile(source, png);
  const image = { id: imageId, type: 'imageGeneration', status: 'completed', savedPath: source, revisedPrompt: 'Actual native image prompt', result: png.toString('base64') };
  const turn = { id: turnId, status: 'completed', items: [image] };
  const client = new EventEmitter(); client.request = async () => ({ thread: { turns: [turn] } });
  const manager = new TaskManager({ client, workspaces: spaces, imageCacheRoot: cache }); await manager.boot;
  const task = { taskId, threadId, turnId, workspace, payload: { settings: { output_count: 1 } } };
  return { manager, task, image, turn, original: { status: 'failed', error: 'helper_unknown_error: setup refresh failed' } };
}
test('原生缓存交付校验真实事件字节，并保留原失败证据', async t => {
  const f = await fixture(t), result = await f.manager.recoverNativeDelivery(f.task, f.original);
  assert.equal(result.status, 'completed'); assert.equal(result.finalPrompt, f.image.revisedPrompt);
  assert.equal(digest(await readFile(result.outputs[0].path)), digest(png));
  assert.deepEqual(f.task.deliveryRecovery.originalAgentResult, f.original);
  assert.equal((await f.manager.recoverNativeDelivery(f.task, f.original)).outputs[0].path, result.outputs[0].path);
});
test('拒绝未完成回合和缺失原生事件', async t => {
  const f = await fixture(t); f.turn.status = 'interrupted';
  await assert.rejects(f.manager.recoverNativeDelivery(f.task, f.original));
  f.turn.status = 'completed'; f.turn.items = [];
  await assert.rejects(f.manager.recoverNativeDelivery(f.task, f.original));
});
test('拒绝跨线程缓存和字节不一致', async t => {
  const f = await fixture(t); f.task.threadId = randomUUID();
  await assert.rejects(f.manager.recoverNativeDelivery(f.task, f.original));
  f.task.threadId = path.basename(path.dirname(f.image.savedPath)); f.image.result = Buffer.from('fake').toString('base64');
  await assert.rejects(f.manager.recoverNativeDelivery(f.task, f.original));
});
test('拒绝越界交付目录及路径穿越身份', async t => {
  const f = await fixture(t); f.task.workspace = path.dirname(f.task.workspace);
  await assert.rejects(f.manager.recoverNativeDelivery(f.task, f.original));
  f.task.threadId = '../other'; await assert.rejects(f.manager.recoverNativeDelivery(f.task, f.original));
});
test('原生缓存路径直接返回时必须匹配本回合真实图片，拒绝替代文件', async t => {
  const f = await fixture(t);
  const original = { status: 'completed', outputs: [{ id: 'agent-id', path: f.image.savedPath, format: 'png' }], finalPrompt: 'agent prompt', error: null };
  const result = await f.manager.recoverNativeDelivery(f.task, original);
  assert.equal(result.finalPrompt, f.image.revisedPrompt); assert.equal(result.outputs[0].id, f.image.id);
  const other = path.join(path.dirname(f.image.savedPath), 'exec-' + randomUUID() + '.png'); await writeFile(other, png);
  await assert.rejects(f.manager.recoverNativeDelivery(f.task, { ...original, outputs: [{ ...original.outputs[0], path: other }] }));
});
test('完成处理自动导入真实原生缓存，而非允许工作区外文件', async t => {
  const f = await fixture(t); f.task.action = 'generate_image'; f.task.sawImageGeneration = true;
  f.task.finalText = JSON.stringify({ status: 'completed', outputs: [{ id: 'agent-id', path: f.image.savedPath, format: 'png' }], finalPrompt: 'agent prompt', error: null });
  f.manager.workspaces.validateResult = async (_task, value) => { assert.equal(path.dirname(value.outputs[0].path), path.join(f.task.workspace, 'output')); assert.deepEqual(await readFile(value.outputs[0].path), png); return value; };
  f.manager.update = async (_task, patch) => Object.assign(f.task, patch);
  await f.manager.complete(f.task, f.turn); assert.equal(f.task.stage, 'completed'); assert.equal(f.task.result.finalPrompt, f.image.revisedPrompt);
});

function fastShowcase(f) {
  Object.assign(f.task, { action: 'generate_image', sawImageGeneration: true });
  Object.assign(f.task.payload, { action: 'generate_image', skill: { id: 'controlled-fixture' }, showcase: { canvas: { schema: 1 } } });
  f.task.finalText = JSON.stringify({ status: 'completed', error: null });
  f.manager.workspaces.validateResult = async (_task, value) => { assert.equal(path.dirname(value.outputs[0].path), path.join(f.task.workspace, 'output')); assert.deepEqual(await readFile(value.outputs[0].path), png); return value; };
  f.manager.update = async (_task, patch) => Object.assign(f.task, patch);
}
test('快速展示图只需短确认，原图和实际 Prompt 来自本回合事件', async t => {
  const f = await fixture(t); fastShowcase(f);
  await f.manager.complete(f.task, f.turn);
  assert.equal(f.task.stage, 'completed'); assert.equal(f.task.result.finalPrompt, f.image.revisedPrompt);
  assert.equal(f.task.deliveryRecovery.mode, 'verified-native-showcase-delivery');
  assert.deepEqual(f.task.deliveryRecovery.originalAgentResult, { status: 'completed', error: null });
});
test('快速交付不可用于普通创作，不能绕过路径验证', async t => {
  const f = await fixture(t); fastShowcase(f); delete f.task.payload.showcase;
  await assert.rejects(f.manager.recoverNativeDelivery(f.task, { status: 'completed', error: null }, { acknowledgement: true }));
  await assert.rejects(f.manager.complete(f.task, f.turn));
});
test('快速交付拒绝缺少真实事件及不匹配字节', async t => {
  const f = await fixture(t); fastShowcase(f); f.turn.items = [];
  await assert.rejects(f.manager.complete(f.task, f.turn));
  f.turn.items = [f.image]; f.image.result = Buffer.from('not the original').toString('base64');
  await assert.rejects(f.manager.complete(f.task, f.turn));
});
test('失败的质量判断不得被快速交付覆盖', async t => {
  const f = await fixture(t); fastShowcase(f);
  f.task.finalText = JSON.stringify({ status: 'failed', error: 'Title is incorrect' });
  f.manager.workspaces.validateResult = async (_task, value) => { assert.equal(value.status, 'failed'); assert.equal(value.error, 'Title is incorrect'); throw new Error('Quality rejected'); };
  await assert.rejects(f.manager.complete(f.task, f.turn), /Quality rejected/);
  assert.equal(f.task.deliveryRecovery, undefined);
});
test('短确认仍拒绝未完成回合与多张原生图', async t => {
  const f = await fixture(t); fastShowcase(f); f.turn.status = 'interrupted';
  await f.manager.complete(f.task, f.turn); assert.equal(f.task.stage, 'interrupted');
  f.turn.status = 'completed'; f.turn.items.push({ ...f.image, id: 'exec-' + randomUUID() });
  await assert.rejects(f.manager.complete(f.task, f.turn));
});
