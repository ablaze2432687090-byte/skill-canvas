import { EventEmitter } from 'node:events';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { adaptSkill, skillProfiles } from '../protocol/skillProfiles.ts';
import { BridgeFailure, classifyFailure } from '../codex/client.mjs';
import { codexInstruction, usesNativeShowcaseDelivery } from '../protocol/task.ts';
import { executionManifest } from '../protocol/executionManifest.ts';
import {purgeProject} from './projectManagement.mjs';
import { digest, validatePng, validatePayload } from './workspace.mjs';
import { readImageEvidence } from './imageProbe.mjs';
import {TaskQueue} from './taskQueue.mjs';

const activeStages = ['queued', 'preparing', 'compiling', 'connecting', 'submitted', 'running'];
const outputSchema = { type: 'object', properties: { status: { type: 'string', enum: ['completed', 'failed'] }, outputs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, path: { type: 'string' }, format: { type: 'string', enum: ['png'] } }, required: ['id', 'path', 'format'], additionalProperties: false } }, finalPrompt: { type: 'string' }, error: { type: ['string', 'null'] } }, required: ['status', 'outputs', 'finalPrompt', 'error'], additionalProperties: false };
const showcaseOutputSchema = { type: 'object', properties: { status: { type: 'string', enum: ['completed', 'failed'] }, error: { type: ['string', 'null'] } }, required: ['status', 'error'], additionalProperties: false };
export class TaskManager extends EventEmitter {
  constructor({ client, workspaces, evidenceFile, projects,maxConcurrency=2, imageCacheRoot = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images') }) {
    super(); this.projects = projects; this.client = client; this.workspaces = workspaces; this.evidenceFile = evidenceFile; this.imageCacheRoot = path.resolve(imageCacheRoot); this.tasks = new Map(); this.creating = new Set();
    this.pool=new TaskQueue({limit:maxConcurrency,start:record=>this.run(record),failed:(record,error)=>this.fail(record,error),queued:record=>this.update(record,{stage:'queued',queuePaused:!!record.queuePaused})});this.boot = this.restore();
    client.on('notification', message => this.notification(message));
    client.on('disconnected', error => { this.pool.pause();for (const task of this.tasks.values()) if (task.stage==='queued')void this.update(task,{queuePaused:true,error:error.toJSON()});else if(activeStages.includes(task.stage))void this.update(task, { stage: 'interrupted', error: error.toJSON() }); });
  }
  async restore() {
    const archived = this.projects ? (await this.projects.all()).flatMap(project => project.tasks) : [];
    const records = new Map([...archived, ...await this.workspaces.all()].map(record => [record.taskId, record]));
    // A committed version wins over a stale task snapshot after a crash between the two writes.
    for (const record of archived) if (record.result?.version && record.stage === 'completed') records.set(record.taskId, record);
    for (const record of records.values()) {
      if(record.stage==='queued'){this.pool.restore(record);record.error={code:'CODEX_CONNECTION_LOST',message:'重启前此任务尚未发送，请确认后继续排队。'};}
      else if (activeStages.includes(record.stage)) { record.stage = 'interrupted'; record.error = { code: 'CODEX_CONNECTION_LOST', message: 'Bridge 曾停止。请恢复线程以核对状态，不会自动重复发送。' }; }
      this.tasks.set(record.taskId, record);
    }
  }
  public(record) { const { payload: _payload, sawImageGeneration: _saw, cancelRequested: _cancel, finalText: _final, submissionHash: _hash, ...handle } = record; return structuredClone({ ...handle, compiledTask: record.payload }); }
  get(id) { const task = this.tasks.get(id); if (!task) throw new BridgeFailure('UNKNOWN', '找不到这个本地任务。'); return task; }
  update(task, patch) {
    Object.assign(task, patch, { sequence: task.sequence + 1, updatedAt: new Date().toISOString() });
    const snapshot = structuredClone(task);
    let persisted=true;
    const saved = Promise.all([this.workspaces.save(snapshot), this.projects && patch.stage ? this.projects.record(snapshot) : undefined]).catch(error => {
      persisted=false;this.pool.pause();
      task.stage = 'failed'; task.error = { code: 'UNKNOWN', message: '任务状态无法写入磁盘，请检查空间或权限。', detail: error.message }; this.emit('task', this.public(task));
    });
    void saved.then(()=>{if(['completed','failed','cancelled','interrupted','waiting'].includes(task.stage)){if(!persisted)this.pool.pause();this.pool.release(task.taskId);}});
    if (patch.stage === 'completed') void saved.then(() => this.emit('task', this.public(task)));
    else this.emit('task', this.public(task)); return saved;
  }
  async status() {
    await this.boot;
    try { await this.client.start(); return { connected: true, authenticated: true, version: this.client.version, model: [...this.tasks.values()].reverse().find(task => task.model)?.model || null, models: this.client.models, bridge: 'ready', checkedAt: new Date().toISOString() }; }
    catch (error) { return { connected: false, authenticated: false, version: this.client.version, model: null, models: [], bridge: 'unavailable', checkedAt: new Date().toISOString(), error: classifyFailure(error, 'CODEX_START_FAILED').toJSON() }; }
  }
  async capabilities() {
    await this.boot;
    // Once formal generations exist, runtime evidence must not depend on a disposable PoC folder.
    for (const task of [...this.tasks.values()].reverse()) {
      if (task.capabilityEvidenceInvalidated || task.stage !== 'completed' || !task.sawImageGeneration || !task.result?.version || !this.projects) continue;
      try {
        const output = task.result.outputs[0];
        validatePng(await this.projects.bytes(task.projectId, output.path, output.sha256));
        return { automaticImageGeneration: true, reason: '本机已有通过内置 ImageGen 事件与原图校验的正式生成记录。', testedAt: task.result.metadata.completedAt || task.updatedAt, fallback: 'confirmation_handoff' };
      } catch { /* Try other intact formal versions, then the original probe. */ }
    }
    try {
      const proof=await readImageEvidence(this.evidenceFile);
      return {automaticImageGeneration:true,reason:'本机内置 ImageGen 已通过真实线程、事件与原图 Hash 校验。',testedAt:proof.checkedAt,fallback:'confirmation_handoff'};
    } catch { /* Legacy local proof below remains readable during upgrade. */ }
    try {
      const proof = JSON.parse(await readFile(this.evidenceFile, 'utf8'));
      const result = JSON.parse(proof.answer);
      if (proof.authType !== 'chatgpt' || proof.turnStatus !== 'completed' || !proof.itemTypes?.includes('imageGeneration') || result.requiresApiKey !== false || result.status !== 'completed') throw new Error();
      const expected = path.join(path.dirname(this.evidenceFile), 'task', 'white-circle-black-background.png');
      if (result.outputs?.[0] !== expected) throw new Error();
      validatePng(await readFile(expected));
      return { automaticImageGeneration: true, reason: '本机 App Server 已通过内置 image_gen 实测；每次任务仍须验证事件和输出。', testedAt: proof.timestamp, fallback: 'confirmation_handoff' };
    } catch { return { automaticImageGeneration: false, reason: '当前环境尚无通过校验的内置图片生成实测记录。可准备任务后在 Codex 中确认执行。', testedAt: null, fallback: 'confirmation_handoff' }; }
  }
  async resolveSkill(payload, cwd) {
    let managedPath = null;
    if (payload.skill.id.startsWith('managed-')) {
      try { managedPath = await this.skills?.resolve(payload.skill); }
      catch (error) { throw new BridgeFailure('REFERENCE_FILE_FAILED', error.message); }
    }
    if (payload.skill.id.startsWith('managed-') && !managedPath) throw new Error('Skill 管理服务不可用。');
    if (managedPath) await this.client.addSkillRoot(path.dirname(path.dirname(managedPath)));
    const result = await this.client.request('skills/list', { cwds: [cwd], forceReload: true });
    const candidates = result.data.flatMap(entry => entry.skills).filter(skill => skill.name === payload.skill.name && skill.enabled !== false);
    for (const candidate of candidates) {
      if (managedPath && path.resolve(candidate.path) !== path.resolve(managedPath)) continue;
      const bytes = await readFile(candidate.path).catch(() => null);
      if (bytes && bytes.length <= 1048576 && digest(bytes) === payload.skill.fingerprint) return candidate.path;
    }
    throw new BridgeFailure('CAPABILITY_UNAVAILABLE', '该 Skill 的原始目录尚未与 Codex 可见的 Skill 精确匹配。已准备交接内容；请在 Codex 中确认原目录后执行。');
  }
  async create(payload, references) {
    await this.boot;
    if(this.maintenanceBusy)throw new BridgeFailure('UNKNOWN','数据清理正在进行，请稍后提交任务。');
    if(this.deletingProjects?.has(payload.projectId)||this.deletedProjects?.has(payload.projectId))throw new BridgeFailure('UNKNOWN','项目已删除或正在删除。');
    validatePayload(payload, references);
    const submissionHash = digest(JSON.stringify({ payload, references }));
    const existing = this.tasks.get(payload.taskId);
    if (existing) { if (existing.projectId !== payload.projectId || existing.submissionHash !== submissionHash) throw new BridgeFailure('UNKNOWN', '任务身份或重复提交内容冲突。'); return this.public(existing); }
    if (this.creating.has(payload.projectId) || [...this.tasks.values()].some(task => task.projectId === payload.projectId && activeStages.includes(task.stage))) throw new BridgeFailure('UNKNOWN', '此项目已有正在执行的任务。');
    this.creating.add(payload.projectId);
    try {
    payload = structuredClone({ ...payload, ...(payload.manifest ? { manifest: executionManifest(payload.manifest) } : {}) });
    if (payload.revision) {
      const base = this.get(payload.revision.baseTaskId);
      if (base.projectId !== payload.projectId || base.stage !== 'completed') throw new BridgeFailure('REFERENCE_FILE_FAILED', '编辑底图不属于当前项目或尚未完成。');
      const output = base.result?.outputs.find(item => item.id === payload.revision.baseOutputId);
      if (!output) throw new BridgeFailure('REFERENCE_FILE_FAILED', '找不到选定版本的原图。');
      if (payload.images.length >= 6) throw new BridgeFailure('REFERENCE_FILE_FAILED', '续改底图占用一个参考图位置，请最多添加 5 张辅助参考图。');
      const data = await this.outputBytes(base, output), id = randomUUID();
      payload.images.unshift({ id, name: `base-${base.result.version || base.taskId}.png`, mime: 'image/png', role: 'edit_target', origin: 'base_version', preservation: 'high', path: null });
      references = [{ id, data: data.toString('base64') }, ...references];
    }
    const workspace = await this.workspaces.prepare(payload, references);
    const now = new Date().toISOString();
    const record = { taskId: payload.taskId, projectId: payload.projectId, threadId: null, turnId: null, stage: 'preparing', sequence: 0, text: '', instruction: '', workspace, action: payload.action, startedAt: now, updatedAt: now, payload, sawImageGeneration: false };
    record.submissionHash = submissionHash;
    this.tasks.set(record.taskId, record);
    try { await this.workspaces.save(record); await this.projects?.record(record); }
    catch (error) { record.stage = 'failed'; record.error = { code: 'REFERENCE_FILE_FAILED', message: '任务输入无法正式保存，未发送给 Codex。', detail: error.message }; await this.workspaces.save(record).catch(() => {}); throw new BridgeFailure('REFERENCE_FILE_FAILED', record.error.message, error.message); }
    await this.pool.enqueue(record);
    return this.public(record);
    } finally { this.creating.delete(payload.projectId); }
  }
  async fail(task, error) {
    if (task.stage === 'cancelled') return;
    const failure = classifyFailure(error, 'TURN_FAILED');
    if (this.skills && task.payload.skill.id.startsWith('managed-') && (['TURN_FAILED', 'REFERENCE_FILE_FAILED'].includes(failure.code) || (failure.code === 'CAPABILITY_UNAVAILABLE' && task.turnId))) {
      try { await this.skills.execution(task.payload.skill.id, task.payload.skill.bundle, false, failure.message); }
      catch (rollbackError) { failure.message += ' Skill 自动回滚未完成，请检查版本管理。'; failure.detail = [failure.detail, rollbackError.message].filter(Boolean).join('\n'); }
    }
    const waiting = failure.code === 'CAPABILITY_UNAVAILABLE';
    await this.update(task, { stage: waiting ? 'waiting' : failure.code === 'CODEX_CONNECTION_LOST' ? 'interrupted' : 'failed', error: failure.toJSON() });
  }
  async run(task) {
    await this.update(task, { stage: 'compiling' });
    task.payload.instruction = task.instruction = codexInstruction(task.payload, path.join(task.workspace, 'output'));
    await writeFile(path.join(task.workspace, 'task.json'), JSON.stringify(task.payload, null, 2));
    await writeFile(path.join(task.workspace, 'CODEX-INSTRUCTIONS.txt'), task.instruction);
    await this.update(task, { stage: 'connecting' }); await this.client.start();
    if (task.cancelRequested) return this.update(task, { stage: 'cancelled' });
    if (task.action === 'generate_image') {
      if (!(await this.capabilities()).automaticImageGeneration) throw new BridgeFailure('CAPABILITY_UNAVAILABLE', '当前环境暂不支持自动后台图片生成，请在 Codex 中确认执行准备好的任务。');
      if (task.payload.output.format !== 'png') throw new BridgeFailure('CAPABILITY_UNAVAILABLE', '本阶段真实生成 PoC 只验证 PNG，请选择 PNG 或使用 Codex 确认执行。');
      task.payload.skill.path = await this.resolveSkill(task.payload, task.workspace);
      if (this.skills && task.payload.skill.id.startsWith('managed-') && task.payload.manifest) {
        // Execution permissions come from the verified server record, not a client marker.
        const verified = this.skills.record(task.payload.skill.id).versions[task.payload.skill.bundle];
        task.payload.manifest.runtime = structuredClone(verified.manifest.runtime);
      }
    }
    task.payload.instruction = task.instruction = codexInstruction(task.payload, path.join(task.workspace, 'output'));
    await writeFile(path.join(task.workspace, 'task.json'), JSON.stringify(task.payload, null, 2));
    await writeFile(path.join(task.workspace, 'CODEX-INSTRUCTIONS.txt'), task.instruction);
    const previous = [...this.tasks.values()].filter(item => item.projectId === task.projectId && item.taskId !== task.taskId && item.threadId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    let thread;
    try { thread = await this.client.request(previous ? 'thread/resume' : 'thread/start', { ...(previous ? { threadId: previous.threadId } : {}), cwd: task.workspace, approvalPolicy: 'never', sandbox: task.action === 'bridge_test' ? 'read-only' : 'workspace-write' }); }
    catch (error) { throw new BridgeFailure('THREAD_CREATE_FAILED', 'Codex 线程创建或恢复失败。', error.message); }
    task.threadId = thread.thread.id; task.model = thread.model;
    await this.update(task, { stage: 'submitted' });
    if (task.cancelRequested) return this.update(task, { stage: 'cancelled' });
    const input = [{ type: 'text', text: task.instruction }, ...(task.payload.skill.path && task.action === 'generate_image' ? [{ type: 'skill', name: task.payload.skill.name, path: task.payload.skill.path }] : []), ...task.payload.images.map(image => ({ type: 'localImage', path: image.path }))];
    const result = await this.client.request('turn/start', { threadId: task.threadId, cwd: task.workspace, input, ...(task.action === 'generate_image' ? { outputSchema: usesNativeShowcaseDelivery(task.payload) ? showcaseOutputSchema : outputSchema } : {}) });
    task.turnId = result.turn.id;
    if (task.cancelRequested) await this.client.request('turn/interrupt', { threadId: task.threadId, turnId: task.turnId });
    if (activeStages.includes(task.stage)) await this.update(task, { stage: 'running' });
  }
  notification(message) {
    const p = message.params || {}, threadId = p.threadId || p.thread?.id;
    const task = [...this.tasks.values()].find(item => item.threadId === threadId && activeStages.includes(item.stage));
    if (!task || (p.turnId && task.turnId && p.turnId !== task.turnId)) return;
    if (message.method === 'turn/started') void this.update(task, { turnId: p.turn.id, stage: 'running' });
    if (message.method === 'item/agentMessage/delta') void this.update(task, { text: (task.text + (p.delta || '')).slice(0, 100000) });
    if (message.method === 'item/completed' && p.item?.type === 'imageGeneration') task.sawImageGeneration = true;
    if (message.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.phase !== 'commentary') task.finalText = p.item.text;
    if (message.method === 'turn/completed') void this.complete(task, p.turn).catch(error => this.fail(task, error));
  }
  async complete(task, turn) {
    const finalMessage = turn.items?.filter(item => item.type === 'agentMessage' && item.phase !== 'commentary').at(-1);
    if (finalMessage) task.finalText = finalMessage.text;
    const answer = task.finalText ?? task.text;
    if (turn.status === 'interrupted') return this.update(task, { stage: task.cancelRequested ? 'cancelled' : 'interrupted', error: { code: task.cancelRequested ? 'TASK_CANCELLED' : 'TURN_INTERRUPTED', message: task.cancelRequested ? '任务已在 Codex 中取消。' : 'Codex 执行被中断。' } });
    if (turn.status !== 'completed') {
      if (turn.error?.codexErrorInfo === 'usageLimitExceeded') throw new BridgeFailure('ACCOUNT_LIMIT_REACHED', 'Codex 账户额度暂时用尽，请待额度恢复后重试。Skill 版本保持不变。', JSON.stringify(turn.error));
      throw new BridgeFailure('TURN_FAILED', 'Codex 执行失败。', JSON.stringify(turn.error || {}));
    }
    if (task.action === 'bridge_test') {
      if (answer.trim() !== 'SKILL_CANVAS_CODEX_BRIDGE_OK') throw new BridgeFailure('TURN_FAILED', '连接诊断返回值不符合预期。', answer.slice(0, 200));
      return this.update(task, { stage: 'completed', error: undefined });
    }
    if (!task.sawImageGeneration) throw new BridgeFailure('CAPABILITY_UNAVAILABLE', '未收到内置图片生成事件，不能将文字回复当作生成成功。');
    let value; try { value = JSON.parse(answer); } catch { throw new BridgeFailure('TURN_FAILED', 'Codex 未返回符合契约的 JSON，未猜测结果路径。'); }
    // Recover only a genuine native image whose delivery failed due to the known
    // Windows helper failure. Never guess filenames or accept an agent's path.
    if (usesNativeShowcaseDelivery(task.payload) && value?.status === 'completed' && value.error === null && Object.keys(value).sort().join(',') === 'error,status') value = await this.recoverNativeDelivery(task, value, { acknowledgement: true });
    else if (value?.status === 'failed' && /helper_unknown_error|setup refresh/i.test(String(value.error || ''))) value = await this.recoverNativeDelivery(task, value);
    // A native cache path is not a deliverable. Import it only after independent
    // thread/image-event and byte verification; unrelated external paths still fail.
    else if (value?.status === 'completed' && typeof task.threadId === 'string' && value.outputs?.length === 1 && typeof value.outputs[0].path === 'string'
      && path.dirname(path.resolve(value.outputs[0].path)) === path.join(this.imageCacheRoot, task.threadId)
      && /^exec-[a-f0-9-]{36}\.png$/i.test(path.basename(value.outputs[0].path))) value = await this.recoverNativeDelivery(task, value);
    let result = await this.workspaces.validateResult(task, value);
    if (result.outputs.length !== task.payload.settings.output_count) throw new BridgeFailure('TURN_FAILED', '有效输出数量不符合请求。');
    if (this.projects) result = await this.projects.publish(task, result);
    await this.update(task, { stage: 'completed', result, error: undefined });
    // Image publication is authoritative; an ancillary skill marker cannot undo it.
    if (this.skills && task.payload.skill.id.startsWith('managed-')) await this.skills.execution(task.payload.skill.id, task.payload.skill.bundle, true).catch(() => {});
  }
  async recoverNativeDelivery(task, original, { acknowledgement = false } = {}) {
    if (acknowledgement && (!usesNativeShowcaseDelivery(task.payload) || original?.status !== 'completed' || original.error !== null || Object.keys(original).sort().join(',') !== 'error,status')) throw new BridgeFailure('TURN_FAILED', '快速展示图确认无效。');
    if (!/^[a-f0-9-]{36}$/i.test(task.threadId) || !/^[a-f0-9-]{36}$/i.test(task.taskId)) throw new BridgeFailure('REFERENCE_FILE_FAILED', '任务身份无效。');
    const turn = this.client.readTurn ? await this.client.readTurn(task.threadId,task.turnId) : (await this.client.request('thread/read', { threadId: task.threadId, includeTurns: true })).thread?.turns?.find(turn => turn.id === task.turnId);
    const images = turn?.items?.filter(item => item.type === 'imageGeneration' && item.status === 'completed') || [];
    if (turn?.status !== 'completed' || images.length !== task.payload.settings.output_count || images.length !== 1) throw new BridgeFailure('TURN_FAILED', original.error);
    const image = images[0];
    if (!image.savedPath || !image.revisedPrompt?.trim() || typeof image.result !== 'string' || !image.result || image.result.length > 100 * 1024 * 1024 || !/^exec-[a-f0-9-]{36}$/i.test(image.id)) throw new BridgeFailure('TURN_FAILED', original.error);
    const root = await realpath(this.imageCacheRoot), source = await realpath(image.savedPath);
    if (path.dirname(source) !== path.join(root, task.threadId) || path.basename(source) !== image.id + '.png') throw new BridgeFailure('REFERENCE_FILE_FAILED', '原生图片缓存与任务线程身份不匹配。');
    if (!acknowledgement && original.status === 'completed' && (original.outputs?.length !== 1 || typeof original.outputs[0].path !== 'string' || await realpath(original.outputs[0].path) !== source)) throw new BridgeFailure('REFERENCE_FILE_FAILED', '返回路径并非本回合的真实原生图片。');
    const bytes = await readFile(source); validatePng(bytes);
    if (digest(bytes) !== digest(Buffer.from(image.result, 'base64'))) throw new BridgeFailure('TURN_FAILED', '原生图片缓存与图像事件字节不匹配。');
    const outputDirectory = await realpath(path.join(task.workspace, 'output'));
    if (outputDirectory !== path.join(await realpath(this.workspaces.root), task.taskId, 'output')) throw new BridgeFailure('REFERENCE_FILE_FAILED', '原生图片交付目录越界。');
    const target = path.join(outputDirectory, 'native-' + image.id + '.png');
    await writeFile(target, bytes, { flag: 'wx' }).catch(async error => { if (error.code !== 'EEXIST' || await realpath(target) !== target || digest(await readFile(target)) !== digest(bytes)) throw error; });
    task.deliveryRecovery = { mode: acknowledgement ? 'verified-native-showcase-delivery' : 'verified-native-cache-copy', at: new Date().toISOString(), nativeTurnId: turn.id, nativeImageId: image.id, source, sha256: digest(bytes), originalAgentResult: original };
    return { status: 'completed', outputs: [{ id: image.id, path: target, format: 'png' }], finalPrompt: image.revisedPrompt, error: null };
  }
  async cancel(id) {
    const queued=this.get(id);if(queued.stage==='queued'){queued.cancelRequested=true;this.pool.remove(id);await this.update(queued,{stage:'cancelled',queuePaused:false,error:{code:'TASK_CANCELLED',message:'排队任务已取消，未发送给 Codex。'}});return this.public(queued);}
    const task = this.get(id);
    if (!activeStages.includes(task.stage)) return this.public(task);
    task.cancelRequested = true;
    if (task.threadId && task.turnId) await this.client.request('turn/interrupt', { threadId: task.threadId, turnId: task.turnId });
    else if (!task.threadId) await this.update(task, { stage: 'cancelled', error: { code: 'TASK_CANCELLED', message: '任务已取消，未发送到 Codex。' } });
    return this.public(task);
  }
  async resume(id) {
    if(this.get(id).stage==='queued')throw new BridgeFailure('UNKNOWN','排队任务尚未发送，请使用继续排队，而不是恢复已有线程。');
    await this.boot; const task = this.get(id);
    if (!task.threadId || ['completed', 'cancelled', 'waiting'].includes(task.stage)) return this.public(task);
    await this.client.start();
    const turn = this.client.readTurn ? await this.client.readTurn(task.threadId,task.turnId) : (await this.client.request('thread/read', { threadId: task.threadId, includeTurns: true })).thread?.turns?.find(item => item.id === task.turnId);
    if (turn && ['completed', 'failed', 'interrupted'].includes(turn.status)) {
      task.text = turn.items.filter(item => item.type === 'agentMessage').map(item => item.text).join('');
      task.sawImageGeneration ||= turn.items.some(item => item.type === 'imageGeneration');
      await this.complete(task, turn).catch(error => this.fail(task, error));
    } else if (activeStages.includes(task.stage)) {
      return this.public(task);
    } else {
      await this.client.request('thread/resume', { threadId: task.threadId, cwd: task.workspace, approvalPolicy: 'never', sandbox: 'workspace-write' });
      await this.update(task, { stage: 'interrupted', error: { code: 'TURN_INTERRUPTED', message: '线程上下文已恢复；旧进程中的执行无法继续，请回工作台发起后续修改。' } });
    }
    return this.public(task);
  }
  async outputBytes(task, output) {
    if (task.result?.version && this.projects) { const bytes = await this.projects.bytes(task.projectId, output.path, output.sha256); validatePng(bytes); return bytes; }
    const checked = await this.workspaces.output(task, output), bytes = await readFile(checked.path);
    if (digest(bytes) !== output.sha256) throw new Error('输出文件 Hash 不一致。'); return bytes;
  }
  async referenceBytes(id, imageId) {
    const task = this.get(id), project = await this.projects?.read(task.projectId);
    const image = project?.tasks.find(item => item.taskId === id)?.payload.images.find(item => item.id === imageId);
    if (!image) throw new BridgeFailure('REFERENCE_FILE_FAILED', '参考图记录不存在。');
    return this.projects.bytes(task.projectId, image.path, image.sha256);
  }
  async retry(id) {
    const task = this.get(id);
    if (!['failed', 'cancelled', 'interrupted', 'waiting'].includes(task.stage)) throw new Error('只有未成功的任务可以重试。');
    if (task.threadId && task.turnId) {
      await this.client.start();
      const turn = this.client.readTurn ? await this.client.readTurn(task.threadId,task.turnId) : (await this.client.request('thread/read', { threadId: task.threadId, includeTurns: true })).thread?.turns?.find(item => item.id === task.turnId);
      if (turn?.status === 'inProgress') throw new Error('Codex 仍在执行原任务，请先恢复连接或取消，避免重复生成。');
      if (turn?.status === 'completed' && !task.result) { await this.resume(id); if (task.stage === 'completed') return this.public(task); }
    }
    const payload = structuredClone(task.payload); payload.taskId = randomUUID(); payload.retryOfTaskId = id; payload.instruction = '';
    payload.images = payload.images.filter(image => image.origin !== 'base_version');
    const references = [];
    for (const image of payload.images) { references.push({ id: image.id, data: (await this.referenceBytes(id, image.id)).toString('base64') }); image.path = null; delete image.sha256; }
    return this.create(payload, references);
  }
  async catalog() {
    await this.boot;
    let response, offline = false;
    try { await this.client.start(); response = await this.client.request('skills/list', { cwds: [this.client.cwd || process.cwd()], forceReload: true }); }
    catch {
      offline = true;
      response = { data: [{ skills: Object.keys(skillProfiles).map(name => ({ name, enabled: true, description: 'Codex 未连接；已保存项目与 Skill 信息仍可查看。', path: path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', '.system', name, 'SKILL.md') })) }] };
    }
    const catalog = [];
    for (const candidate of response.data.flatMap(entry => entry.skills)) {
      const nativePath = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', '.system', candidate.name, 'SKILL.md');
      if (path.resolve(candidate.path) !== path.resolve(nativePath)) continue;
      if (!skillProfiles[candidate.name] || candidate.enabled === false || catalog.some(item => item.name === candidate.name)) continue;
      const bytes = await readFile(candidate.path).catch(() => null); if (!bytes) continue;
      const fingerprint = digest(bytes), id = `codex-${digest(candidate.path).slice(0, 24)}`, now = new Date().toISOString();
      catalog.push(adaptSkill({ id, declaredId: candidate.name, name: candidate.name, description: candidate.description, categories: ['视觉创作'], source: { type: 'local', repository: null, author: null, path: candidate.path, fingerprint }, version: { installed: `sha256:${fingerprint}`, latest: null, commit: null, updateStatus: 'unchecked' }, runtime: { status: offline ? 'unavailable' : 'ready', compatible: true, dependencies: [], issues: offline ? ['Codex 未连接，请在设置中检查安装、版本与登录。'] : [] }, inputs: [], outputs: [], parameters: [], examples: [], installation: { id, rootId: 'codex-native', path: candidate.path, installed: true, installedAt: now, updatedAt: now, favorite: false, validation: 'valid', updateStrategy: 'manual', previousVersion: null }, instructions: bytes.toString('utf8') }));
    }
    return [...catalog, ...await this.skills?.list() || []];
  }
  async projectList(includeArchived = false) {
    return (await this.projects?.all() || []).filter(project => includeArchived || !project.archived).map(project => ({ id: project.id, management:project.management, ...(project.archived ? { archived: true } : {}), tasks: project.archived ? [] : project.tasks.map(task => this.public(this.tasks.get(task.taskId) || task)) }));
  }
  async deleteProject(id){return purgeProject(this,id);}
  async remove(id) { const task = this.get(id); if (activeStages.includes(task.stage)) throw new BridgeFailure('UNKNOWN', '请先取消任务再清理工作区。'); await this.workspaces.remove(id).catch(error => { if (error.code !== 'ENOENT') throw error; }); if (!this.projects || task.action !== 'generate_image') this.tasks.delete(id); }
}
