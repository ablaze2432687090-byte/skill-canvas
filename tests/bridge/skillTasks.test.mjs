import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { TaskManager } from '../../bridge/server/tasks.mjs';
import { BridgeFailure, CodexClient } from '../../bridge/codex/client.mjs';
import { hash } from '../../bridge/server/skillSources.mjs';

const testRoot = path.resolve('work/phase5/task-unit'); await mkdir(testRoot, { recursive: true });
const managedId = `managed-${'a'.repeat(24)}`;
async function sourceFixture(t) {
  const directory = await mkdtemp(path.join(testRoot, 'pin-'));
  const pinned = path.join(directory, 'versions/v1/fixture/SKILL.md'), current = path.join(directory, 'versions/v2/fixture/SKILL.md');
  for (const file of [pinned, current]) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, '---\nname: fixture\ndescription: test\n---\nNative image instructions'); }
  t.after(async () => { const target = path.resolve(directory); if (!target.startsWith(testRoot + path.sep)) throw new Error('Unsafe cleanup'); await rm(target, { recursive: true, force: true }); });
  return { pinned, current, fingerprint: hash(await readFile(pinned)) };
}

test('Runner 用 immutable pin 的额外根目录并精确匹配路径，即使新版同名同内容也不替换', async t => {
  const { pinned, current, fingerprint } = await sourceFixture(t), calls = [];
  const manager = Object.create(TaskManager.prototype);
  manager.skills = { resolve: async skill => { assert.equal(skill.bundle, 'pinned-bundle'); return pinned; } };
  manager.client = { addSkillRoot: async root => { calls.push({ method: 'addSkillRoot', root }); }, request: async (method, params) => { calls.push({ method, params }); return { data: [{ skills: [{ name: 'fixture', path: current }, { name: 'fixture', path: pinned }] }] }; } };
  const payload = { skill: { id: managedId, name: 'fixture', fingerprint, bundle: 'pinned-bundle' } };
  const resolved = await manager.resolveSkill(payload, 'task-cwd');
  assert.equal(resolved, pinned);
  assert.deepEqual(calls, [{ method: 'addSkillRoot', root: path.dirname(path.dirname(pinned)) }, { method: 'skills/list', params: { cwds: ['task-cwd'], forceReload: true } }]);
});

test('Runner 缺失管理服务、pin 验证失败或 Codex 不识别时不能退回同名新版', async t => {
  const { pinned, current, fingerprint } = await sourceFixture(t);
  const manager = Object.create(TaskManager.prototype), payload = { skill: { id: managedId, name: 'fixture', fingerprint, bundle: 'pin' } };
  manager.client = { addSkillRoot: async () => {}, request: async () => ({ data: [{ skills: [{ name: 'fixture', path: current }] }] }) };
  await assert.rejects(manager.resolveSkill(payload, 'cwd'), /管理服务不可用/);
  manager.skills = { resolve: async () => { throw new Error('pinned file corrupt'); } };
  await assert.rejects(manager.resolveSkill(payload, 'cwd'), /corrupt/);
  manager.skills = { resolve: async () => pinned };
  await assert.rejects(manager.resolveSkill(payload, 'cwd'), /精确匹配/);
});

test('CodexClient 使用本机支持的进程级 extraRoots/set，保留多项目的不可变根且重复调用不重复路径', async () => {
  const client = new CodexClient(), calls = [], roots = ['v1', 'v2', 'other-project'].map(name => path.join(testRoot, name));
  client.start = async () => client;
  client.request = async (method, params) => { calls.push({ method, params }); return {}; };
  await client.addSkillRoot(roots[0]);
  await client.addSkillRoot(roots[1]);
  await client.addSkillRoot(roots[0]);
  await client.addSkillRoot(roots[2]);
  assert.deepEqual(calls.map(call => call.params.extraRoots), [[roots[0]], [roots[0], roots[1]], [roots[0], roots[1]], roots]);
  assert.ok(calls.every(call => call.method === 'skills/extraRoots/set'));
  // A reconnect must resend all still-pinned roots, not only the most recent one.
  calls.length = 0;
  await client.addSkillRoot(roots[0]);
  assert.deepEqual(calls[0], { method: 'skills/extraRoots/set', params: { extraRoots: roots } });
});

test('CodexClient 注册额外根失败直接报错，不假装 Skill 已识别', async () => {
  const client = new CodexClient(); client.start = async () => client;
  client.request = async () => { throw new BridgeFailure('TURN_FAILED', 'extraRoots unsupported'); };
  await assert.rejects(client.addSkillRoot(path.join(testRoot, 'root')), /extraRoots unsupported/);
});

function managerFixture() {
  const callbacks = [], manager = Object.create(TaskManager.prototype);
  manager.update = async (task, patch) => Object.assign(task, patch);
  manager.skills = { execution: async (...args) => { callbacks.push(args); } };
  const task = { taskId: 'fixture-task', stage: 'running', cancelRequested: false, sawImageGeneration: true, text: JSON.stringify({ status: 'completed', outputs: [], finalPrompt: 'native prompt' }), action: 'generate_image', payload: { skill: { id: managedId, bundle: 'new-bundle' }, settings: { output_count: 1 } } };
  manager.workspaces = { validateResult: async () => ({ outputs: [{ id: 'original', path: 'original.png' }] }) };
  manager.projects = { publish: async (_task, result) => ({ ...result, version: 1 }) };
  return { manager, task, callbacks };
}

test('Runner 真正完成且原图已发布后才标记 Skill 稳定', async () => {
  const { manager, task, callbacks } = managerFixture();
  manager.skills.execution = async (...args) => { assert.equal(task.stage, 'completed'); assert.equal(task.result.version, 1); callbacks.push(args); };
  await manager.complete(task, { status: 'completed' });
  assert.deepEqual(callbacks, [[managedId, 'new-bundle', true]]);
});

test('Runner 失败通知管理器回滚；取消、桥接中断和未确认能力不误回滚', async () => {
  const { manager, task, callbacks } = managerFixture();
  await manager.fail(task, new BridgeFailure('TURN_FAILED', 'Skill runtime failure'));
  assert.equal(task.stage, 'failed'); assert.deepEqual(callbacks, [[managedId, 'new-bundle', false, 'Skill runtime failure']]);
  for (const code of ['CODEX_CONNECTION_LOST', 'CAPABILITY_UNAVAILABLE']) {
    task.stage = 'running'; await manager.fail(task, new BridgeFailure(code, 'Not a Skill regression'));
  }
  task.stage = 'cancelled'; await manager.fail(task, new Error('late cancellation error'));
  assert.equal(callbacks.length, 1);
  task.stage = 'running'; task.cancelRequested = true;
  await manager.complete(task, { status: 'interrupted' });
  assert.equal(task.stage, 'cancelled'); assert.equal(callbacks.length, 1);
});

test('Skill 稳定标记写入失败不能逆转已正式发布的 PNG 与完成状态', async () => {
  const { manager, task } = managerFixture();
  manager.skills.execution = async () => { throw new Error('skill metadata disk locked'); };
  await assert.doesNotReject(manager.complete(task, { status: 'completed' }));
  assert.equal(task.stage, 'completed'); assert.equal(task.result.version, 1);
});

test('Runner 已有真实 Turn 却缺少原生生成事件时回滚新版，不与提交前的能力检查失败混淆', async () => {
  const { manager, task, callbacks } = managerFixture();
  task.turnId = 'fixture-started-turn'; task.sawImageGeneration = false;
  let error;
  try { await manager.complete(task, { status: 'completed' }); }
  catch (failure) { error = failure; }
  assert.equal(error?.code, 'CAPABILITY_UNAVAILABLE');
  await manager.fail(task, error);
  assert.deepEqual(callbacks, [[managedId, 'new-bundle', false, error.message]]);
});

test('Skill catalog 不会把其它目录中的同名 imagegen 误认为内置默认 Skill', async t => {
  const { current } = await sourceFixture(t), manager = Object.create(TaskManager.prototype);
  manager.client = {
    start: async () => {},
    request: async () => ({ data: [{ skills: [{ name: 'imagegen', description: 'Untrusted same-name fixture', path: current, enabled: true }] }] }),
  };
  assert.deepEqual(await manager.catalog(), []);
});

test('账户额度失败保留 Skill 当前版本，不误判为第三方 Skill 回归', async () => {
  const { manager, task, callbacks } = managerFixture(); task.turnId = 'quota-failed-turn';
  let error;
  try { await manager.complete(task, { status: 'failed', error: { codexErrorInfo: 'usageLimitExceeded', message: 'Account quota exceeded' } }); }
  catch (failure) { error = failure; }
  assert.equal(error.code, 'ACCOUNT_LIMIT_REACHED'); await manager.fail(task, error);
  assert.equal(task.stage, 'failed'); assert.equal(callbacks.length, 0);
});
