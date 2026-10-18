import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TaskWorkspaces, validatePayload } from '../../bridge/server/workspace.mjs';
import { TaskManager } from '../../bridge/server/tasks.mjs';
import { BridgeFailure } from '../../bridge/codex/client.mjs';

const payload = () => ({
  schema: 1, taskId: randomUUID(), projectId: randomUUID(), action: 'generate_image',
  skill: { id: 'managed-fixture', name: 'fixture-only', instructions: '', fingerprint: '', path: null },
  request: { prompt: 'Controlled contract test', requirements: [] }, images: [],
  settings: { aspect_ratio: '3:4', size: '1536 × 2048', output_count: 1 }, extensions: { layout: 'fixture' }, output: { format: 'png' },
  showcase: { schema: 1, setId: randomUUID(), role: 'cover', ordinal: 0, label: '测试', purpose: '测试', canvas: { schema: 1, aspect_ratio: '3:4', size: '1536 × 2048', composition: 'recompose', source_parameters: { output_ratio: '3:5' } } },
});

test('新展示画布禁止矛盾尺寸、非法源选项和非 PNG，旧协议保持可读', () => {
  const task = payload(); validatePayload(task, []);
  for (const mutate of [
    value => { value.settings.aspect_ratio = '3:5'; },
    value => { value.settings.size = 'auto'; },
    value => { value.extensions.output_ratio = '3:5'; },
    value => { value.extensions.output_size = '1024 × 1024'; },
    value => { value.extensions.output_count = '2'; },
    value => { value.showcase.canvas.aspect_ratio = '1:1'; },
    value => { value.showcase.canvas.composition = 'stretch'; },
    value => { value.showcase.canvas.source_parameters = null; },
    value => { value.showcase.canvas.source_parameters.prompt = 'unexpected'; },
    value => { value.showcase.canvas.source_parameters.output_ratio = {}; },
    value => { value.output.format = 'jpeg'; },
  ]) {
    const invalid = structuredClone(task); mutate(invalid); assert.throws(() => validatePayload(invalid, []), /展示画布/);
  }
  for (const count of [1, '1']) {
    const legacy = structuredClone(task); legacy.extensions.output_count = count;
    assert.doesNotThrow(() => validatePayload(legacy, []));
  }
  delete task.showcase.canvas; task.settings.aspect_ratio = '3:5'; task.settings.size = 'auto'; task.extensions.output_ratio = '3:5';
  assert.doesNotThrow(() => validatePayload(task, []));
});

// The output fixture represents dimensions returned by output() after its PNG,
// file-boundary and hash checks. This tests publication gates without image calls.
async function resultFor(task, dimensions) {
  const workspaces = Object.create(TaskWorkspaces.prototype);
  const original = { id: 'image', path: 'fixture.png', format: 'png', sha256: 'f'.repeat(64), ...dimensions };
  workspaces.output = async () => original;
  const record = { taskId: task.taskId, projectId: task.projectId, payload: task, startedAt: '2026-10-05T00:00:00Z' };
  const value = { status: 'completed', finalPrompt: 'Actual native portrait prompt', outputs: [{ id: 'image', path: 'fixture.png', format: 'png' }] };
  return { result: await workspaces.validateResult(record, value), original };
}

test('新展示图按实际像素验收，允许整数舍入，不拉伸或伪造尺寸', async () => {
  for (const dimensions of [{ width: 1536, height: 2048 }, { width: 1086, height: 1448 }, { width: 1152, height: 1536 }, { width: 1087, height: 1448 }]) {
    const { result, original } = await resultFor(payload(), dimensions);
    assert.equal(result.outputs[0], original); assert.deepEqual({ width: original.width, height: original.height }, dimensions);
  }
  for (const dimensions of [{ width: 1536, height: 1024 }, { width: 971, height: 1619 }, { width: 1024, height: 1280 }]) {
    await assert.rejects(resultFor(payload(), dimensions), error => error.code === 'OUTPUT_ASPECT_RATIO_MISMATCH' && /原文件已保留/.test(error.message));
  }
  const old = payload(); delete old.showcase.canvas;
  const legacy = await resultFor(old, { width: 1536, height: 1024 });
  assert.equal(legacy.result.outputs[0].width, 1536);
  delete old.showcase;
  assert.equal((await resultFor(old, { width: 971, height: 1619 })).result.outputs[0].height, 1619);
});

test('展示比例不合只使该任务失败，不标记或回滚原 Skill', async () => {
  const manager = Object.create(TaskManager.prototype), callbacks = [];
  manager.update = async (task, patch) => Object.assign(task, patch);
  manager.skills = { execution: async (...args) => callbacks.push(args) };
  const task = { stage: 'running', turnId: 'existing-turn', payload: payload() };
  await manager.fail(task, new BridgeFailure('OUTPUT_ASPECT_RATIO_MISMATCH', '展示图需按 3:4 重新构图'));
  assert.equal(task.stage, 'failed'); assert.equal(task.error.code, 'OUTPUT_ASPECT_RATIO_MISMATCH');
  assert.equal(callbacks.length, 0); assert.equal(task.payload.showcase.canvas.aspect_ratio, '3:4');
});
