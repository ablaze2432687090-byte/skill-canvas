import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
const execute = promisify(execFile);
export class BridgeFailure extends Error {
  constructor(code, message, detail = '') { super(message); this.code = code; this.detail = detail; }
  toJSON() { return { code: this.code, message: this.message, detail: this.detail }; }
}
export function classifyFailure(error, code = 'UNKNOWN') {
  if (error instanceof BridgeFailure) return error;
  return new BridgeFailure(error?.code === 'ENOENT' ? 'CODEX_NOT_INSTALLED' : code, error?.code === 'ENOENT' ? '没有找到 Codex CLI。' : 'Codex 操作未完成。', String(error?.message || error).slice(0, 1500));
}
export function checkVersion(value) {
  const match = value.match(/codex-cli (\d+)\.(\d+)\.(\d+)([^\s]*)/);
  if (!match || (+match[1] === 0 && +match[2] < 153)) throw new BridgeFailure('CODEX_VERSION_UNSUPPORTED', 'Codex CLI 版本低于本项目验证基线 0.153.0。', value);
  return match[0].replace('codex-cli ', '');
}
export class CodexClient extends EventEmitter {
  constructor({ executable = 'codex', cwd, spawnProcess = spawn, executeFile = execute } = {}) { super(); this.executable = executable; this.cwd = cwd; this.spawnProcess = spawnProcess; this.executeFile = executeFile; this.pending = new Map(); this.sequence = 0; this.child = null; this.starting = null; this.version = null; this.models = []; this.defaultModel = null; }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this.connect().catch(error => { this.starting = null; this.close(); throw classifyFailure(error, 'CODEX_START_FAILED'); });
    return this.starting;
  }
  async addSkillRoot(root) {
    await this.start(); this.skillRoots ||= new Set(); this.skillRoots.add(root);
    // The installed CLI exposes process-level roots, not perCwdExtraUserRoots.
    // Keep immutable versions visible concurrently; explicit skill.path selects the pin.
    await this.request('skills/extraRoots/set', { extraRoots: [...this.skillRoots] });
  }
  async removeSkillRoots(roots) {
    for (const root of roots) this.skillRoots?.delete(root);
    if (this.child) await this.request('skills/extraRoots/set', { extraRoots: [...this.skillRoots || []] });
  }
  async readTurn(threadId,turnId) {
    if(this.historyPagination!==false){
      let cursor;const seen=new Set();
      try{
        for(let page=0;page<100;page++){
          const result=await this.request('thread/turns/list',{threadId,limit:10,sortDirection:'desc',itemsView:'full',...(cursor?{cursor}:{})});
          if(!Array.isArray(result.data))throw new BridgeFailure('TURN_FAILED','Codex 历史分页格式不受支持。');
          const turn=result.data.find(item=>item.id===turnId);if(turn)return turn;
          if(!result.nextCursor)return null;
          if(seen.has(result.nextCursor))throw new BridgeFailure('TURN_FAILED','Codex 历史分页游标重复。');
          cursor=result.nextCursor;seen.add(cursor);
        }
        throw new BridgeFailure('TURN_FAILED','Codex 历史过长，请稍后重试读取。');
      }catch(error){
        let remote;try{remote=JSON.parse(error.detail);}catch{}
        if(remote?.code===-32601||/unknown method|method not found/i.test(remote?.message||''))this.historyPagination=false;
        else if(/rollout .* is empty|thread .*not materialized/i.test(remote?.message||''))return null;
        else throw error;
      }
    }
    try{return (await this.request('thread/read',{threadId,includeTurns:true})).thread?.turns?.find(t=>t.id===turnId)||null;}
    catch(error){if(/rollout .* is empty|thread .*not materialized/i.test(error.detail||''))return null;throw error;}
  }
  async connect() {
    const version = await this.executeFile(this.executable, ['--version'], { windowsHide: true, timeout: 10000 });
    this.version = checkVersion(version.stdout);
    const env = { ...process.env }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
    this.child = this.spawnProcess(this.executable, ['app-server', '--listen', 'stdio://', '-c', 'analytics.enabled=false'], { cwd: this.cwd, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const child = this.child;
    if (child.pid) this.emit('process', { pid: child.pid });
    child.stdin.on('error', error => { if (this.child === child) this.disconnect(classifyFailure(error, 'CODEX_CONNECTION_LOST')); });
    child.stderr.on('data', () => {}); // Never forward logs that might contain credentials.
    child.on('error', error => { if (this.child === child) this.disconnect(classifyFailure(error, 'CODEX_START_FAILED')); });
    child.on('exit', () => { this.emit('process-exit', { pid: child.pid }); if (this.child === child) this.disconnect(new BridgeFailure('CODEX_CONNECTION_LOST', 'Codex 进程已退出。')); });
    createInterface({ input: this.child.stdout }).on('line', line => {
      if (this.child !== child) return;
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.id !== undefined && message.method) { this.send({ id: message.id, error: { code: -32601, message: 'Skill Canvas does not approve additional permissions or credentials.' } }); return; }
      const request = this.pending.get(message.id);
      if (request) { clearTimeout(request.timer); this.pending.delete(message.id); message.error ? request.reject(new BridgeFailure('TURN_FAILED', 'Codex 返回错误。', JSON.stringify(message.error).slice(0, 1500))) : request.resolve(message.result); }
      else if (message.method) this.emit('notification', message);
    });
    await this.request('initialize', { clientInfo: { name: 'skill_canvas', title: 'Skill Canvas', version: '1.0.0' } });
    this.send({ method: 'initialized', params: {} });
    const account = await this.request('account/read', { refreshToken: false });
    if (account.account?.type !== 'chatgpt') throw new BridgeFailure('CODEX_NOT_AUTHENTICATED', '请先在 Codex 中通过 ChatGPT 登录。本工具不使用 API Key 登录。');
    const models = await this.request('model/list', {});
    this.models = (models.data || []).map(model => model.model); this.defaultModel = models.data?.find(model => model.isDefault)?.model || null;
    return this;
  }
  send(value) { if (!this.child?.stdin.writable) throw new BridgeFailure('CODEX_CONNECTION_LOST', 'Codex 连接已断开。'); this.child.stdin.write(JSON.stringify(value) + '\n'); }
  request(method, params = {}, timeout = 45000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence, timer = setTimeout(() => { this.pending.delete(id); reject(new BridgeFailure('CODEX_CONNECTION_LOST', `Codex 请求超时：${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  disconnect(error) { const child = this.child; this.child = null; this.starting = null; for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); } this.pending.clear(); if (child) { child.stdin.end(); child.kill(); } this.emit('disconnected', error); }
  close() { if (this.child || this.pending.size) this.disconnect(new BridgeFailure('CODEX_CONNECTION_LOST', 'Codex 连接已关闭。')); }
}
