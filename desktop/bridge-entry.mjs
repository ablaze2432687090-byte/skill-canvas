import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { createBridgeRuntime } from '../bridge/server/index.mjs';
import { ImageProbe } from '../bridge/server/imageProbe.mjs';
const dataRoot = process.env.SKILL_CANVAS_DATA_ROOT;
if (!dataRoot || !path.isAbsolute(dataRoot)) throw new Error('Desktop data root is required');
const token = randomBytes(32).toString('hex');
const send = value => process.parentPort?.postMessage(value);
const { manager, client, server } = createBridgeRuntime({ cwd: dataRoot, dataRoot, tasksRoot: path.join(dataRoot, 'Tasks'), evidenceFile: path.join(dataRoot, 'Settings/image-probe-result.json'), executable: process.env.SKILL_CANVAS_CODEX || 'codex', port: 0, token, allowedOrigins: ['app://canvas'], onProcess: value => send({ type: 'owned-codex', ...value }), onProcessExit: value => send({ type: 'codex-exit', ...value }) });
const active = () => [...manager.tasks.values()].filter(t => ['queued', 'preparing', 'compiling', 'connecting', 'submitted', 'running'].includes(t.stage));
const probe=new ImageProbe({client,evidenceFile:path.join(dataRoot,'Settings/image-probe-result.json'),imageCacheRoot:manager.imageCacheRoot,hasActiveTasks:()=>active().length>0});
let closing = false;
async function close() {
  if (closing) return; closing = true;
  await probe.cancel();client.close();
  await Promise.all([...manager.workspaces.queues.values(), ...manager.projects.queues.values()].map(p => p.catch(() => {})));
  server.closeAllConnections(); server.close(() => process.exit(0));
}
process.parentPort?.on('message', async ({ data }) => {
  try {
    if (data.type === 'active') send({ id: data.id, result: [...active().map(t => t.taskId),...(probe.active()?['image-probe']:[])] });
    if (data.type === 'cancel-all') { manager.pool.pause();await probe.cancel();await Promise.all(active().map(t => manager.cancel(t.taskId).catch(() => {}))); send({ id: data.id, result: true }); }
    if (data.type === 'probe-start') send({id:data.id,result:await probe.start()});
    if (data.type === 'probe-state') send({id:data.id,result:probe.snapshot()});
    if (data.type === 'shutdown') await close();
  } catch { send({ id: data.id, error: 'BRIDGE_OPERATION_FAILED' }); }
});
manager.on('task', task => { if (['failed', 'interrupted'].includes(task.stage)) send({ type: 'log', event: 'task-failed', code: task.error?.code || 'UNKNOWN', taskId: task.taskId }); });
manager.on('diagnostic', value => send({ type: 'log', ...value }));
server.on('error', () => send({ type: 'fatal', code: 'BRIDGE_LISTEN_FAILED' }));
server.listen(0, '127.0.0.1', async () => {
  await manager.boot;
  send({ type: 'ready', base: `http://127.0.0.1:${server.address().port}`, token });
  void manager.status().then(status => send({ type: 'log', event: 'codex-check', code: status.error?.code || 'CONNECTED' }));
});
process.on('SIGTERM', close); process.on('SIGINT', close);
