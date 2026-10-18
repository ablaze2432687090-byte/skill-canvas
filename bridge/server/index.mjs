import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CodexClient, classifyFailure } from '../codex/client.mjs';
import { TaskWorkspaces, digest } from './workspace.mjs';
import { ProjectStore } from './projects.mjs';
import { TaskManager } from './tasks.mjs';
import { SkillRegistry } from './skills.mjs';
import {projectMetadata,deletionImpact} from './projectManagement.mjs';
import {storageUsage,cleanTemporary} from './maintenance.mjs';
import {PortableReader} from '../../desktop/portable.mjs';
import {CustomizationStore} from './customization.mjs';

export function createBridgeServer(manager, { port = 4717, token = randomBytes(32).toString('hex'), allowedOrigins = ['http://127.0.0.1:5173', 'http://127.0.0.1:4173'] } = {}) {
  const origins = new Set(allowedOrigins);
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!origins.has(origin) || req.headers.host !== `127.0.0.1:${server.address()?.port || port}`) return json(res, 403, { error: { code: 'UNKNOWN', message: '拒绝非授权来源。' } });
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Skill-Canvas-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/session' && req.method === 'GET') return json(res, 200, { token });
    const given = Buffer.from(String(req.headers['x-skill-canvas-token'] || '')), expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return json(res, 401, { error: { code: 'CODEX_CONNECTION_LOST', message: 'Bridge 会话已过期，请重新检测连接。' } });
    try {
      await manager.boot;
      if (url.pathname.startsWith('/skill-management/') && req.method === 'POST') {
        if (!manager.skills) throw new Error('Skill 管理服务不可用。');
        if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('仅接受 JSON。');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 96 * 1024 * 1024) throw new Error('Skill 安装请求超过 96 MB。'); chunks.push(chunk); }
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8')), action = url.pathname.slice('/skill-management/'.length);
        if(action==='delete-impact')return json(res,200,await deletionImpact(manager,input.ids));
        if(action==='storage-usage')return json(res,200,await storageUsage(path.dirname(manager.projects.root)));
        if(action==='storage-clean'){if(input.confirm!==true)throw Error('清理需要确认。');if(manager.maintenanceBusy)throw Error('已有清理正在进行。');manager.maintenanceBusy=true;try{return json(res,200,await cleanTemporary(manager,path.dirname(manager.projects.root)));}finally{manager.maintenanceBusy=false;}}
        if(action==='portable-state')return json(res,200,await manager.portable.metadata());
        if(action==='portable-asset')return json(res,200,await manager.portable.asset(input.key));
        if(action==='portable-consume')return json(res,200,await manager.portable.consume(input.id));
        if(action.startsWith('personal-')){
          if(!manager.customization)throw Error('Personal settings service is unavailable.');
          if(action==='personal-read')return json(res,200,await manager.customization.read());
          if(action==='personal-write'){const saved=await manager.customization.write(input.value);manager.pool?.setLimit(saved.workflow?.maxConcurrency||2);return json(res,200,saved);}
          if(action==='personal-upload')return json(res,200,await manager.customization.upload(input));
          if(action==='personal-media')return json(res,200,await manager.customization.media(input.id));
          throw Error('Unknown personal settings operation.');
        }
        if(action==='queue-state')return json(res,200,manager.pool.snapshot());
        if (action === 'preview') return json(res, 200, await manager.skills.preview(input));
        if (action === 'review') return json(res, 200, await manager.skills.review(input));
        if (action === 'install') return json(res, 200, await manager.skills.install(input));
        if (action === 'check') return json(res, 200, await manager.skills.check(input.id));
        if(action==='changes')return json(res,200,await manager.skills.changes(input.id));
        if (action === 'update') return json(res, 200, await manager.skills.update(input.id, input));
        if (action === 'configure') return json(res, 200, await manager.skills.configure(input.id));
        if (action === 'revalidate') return json(res, 200, await manager.skills.revalidate(input.id));
        if (action === 'remove' && [...manager.tasks.values()].some(t => t.payload.skill.id === input.id && ['queued', 'preparing', 'compiling', 'connecting', 'submitted', 'running'].includes(t.stage))) throw new Error('此 Skill 正在执行，请完成或取消后再移除。');
        const manifest = await manager.skills.action(input.id, action, input);
        if (action === 'remove') await manager.client.removeSkillRoots(Object.values(manager.skills.record(input.id).versions).map(version => path.dirname(path.dirname(version.manifest.source.path))));
        return json(res, 200, manifest);
      }
      if (url.pathname === '/skills' && req.method === 'GET') return json(res, 200, await manager.catalog());
      if (url.pathname === '/projects' && req.method === 'GET') return json(res, 200, await manager.projectList(url.searchParams.get('includeArchived') === 'true'));
      const projectMatch = url.pathname.match(/^\/projects\/([0-9a-f-]{36})$/i);
      if (projectMatch && req.method === 'DELETE') return json(res,200,await manager.deleteProject(projectMatch[1]));
      if(projectMatch&&req.method==='PATCH'){
        if(manager.deletingProjects?.has(projectMatch[1])||manager.deletedProjects?.has(projectMatch[1]))throw Error('项目已删除或正在删除。');
        let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)throw Error('项目元数据过大。');}
        const patch=projectMetadata(JSON.parse(body));await manager.projects.transact(projectMatch[1],p=>{p.management={...p.management,...patch};});return json(res,200,{saved:true});
      }
      if (url.pathname === '/status' && req.method === 'GET') return json(res, 200, await manager.status());
      if (url.pathname === '/capabilities' && req.method === 'GET') return json(res, 200, await manager.capabilities());
      if (url.pathname === '/tasks' && req.method === 'POST') {
        if(manager.maintenanceBusy)throw Error('数据清理正在进行，请稍后提交任务。');
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: { code: 'UNKNOWN', message: '仅接受 JSON。' } });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 70 * 1024 * 1024) { json(res, 413, { error: { code: 'REFERENCE_FILE_FAILED', message: '请求过大。' } }); req.destroy(); return; } chunks.push(chunk); }
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return json(res, 202, await manager.create(input.task, input.references));
      }
      const match = url.pathname.match(/^\/tasks\/([0-9a-f-]{36})(?:\/(events|cancel|resume|retry|enqueue|references|outputs)(?:\/([\w-]+))?)?$/i);
      if (match) {
        const [, id, action, outputId] = match;
        if (!action && req.method === 'GET') return json(res, 200, manager.public(manager.get(id)));
        if (!action && req.method === 'DELETE') { await manager.remove(id); return json(res, 200, { removed: true }); }
        if(action==='enqueue'&&req.method==='POST'){const task=manager.get(id);if(task.stage!=='queued'||task.threadId||task.turnId)throw Error('只有尚未发送的排队任务可以继续排队。');task.error=undefined;await manager.pool.resume(task);return json(res,202,manager.public(task));}
        if (action === 'retry' && req.method === 'POST') return json(res, 202, await manager.retry(id));
        if (action === 'references' && req.method === 'GET') { const bytes = await manager.referenceBytes(id, outputId); res.writeHead(200, { 'Content-Type': manager.get(id).payload.images.find(image => image.id === outputId)?.mime || 'application/octet-stream', 'Cache-Control': 'no-store' }); return res.end(bytes); }
        if (action === 'cancel' && req.method === 'POST') return json(res, 200, await manager.cancel(id));
        if (action === 'resume' && req.method === 'POST') return json(res, 200, await manager.resume(id));
        if (action === 'events' && req.method === 'GET') {
          const current = manager.public(manager.get(id));
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
          const emit = task => { if (task.taskId === id) res.write(`id: ${task.sequence}\nevent: task\ndata: ${JSON.stringify(task)}\n\n`); };
          manager.on('task', emit); emit(current);
          const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000);
          res.on('close', () => { clearInterval(heartbeat); manager.off('task', emit); }); return;
        }
        if (action === 'outputs' && req.method === 'GET') {
          const task = manager.get(id), output = task.result?.outputs.find(item => item.id === outputId);
          if (task.stage !== 'completed' || !output) throw new Error('输出尚未通过验证。');
          const bytes = await manager.outputBytes(task, output);
          if (digest(bytes) !== output.sha256) throw new Error('输出在验证后被修改，拒绝回传。');
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); return res.end(bytes);
        }
      }
      json(res, 404, { error: { code: 'UNKNOWN', message: '接口不存在。' } });
    } catch (error) { if (url.pathname.startsWith('/skill-management/')) manager.emit?.('diagnostic', { event: 'skill-operation-failed', code: 'SKILL_OPERATION_FAILED' }); if (!res.headersSent) json(res, 400, { error: url.pathname.startsWith('/skill-management/') ? { code: 'UNKNOWN', message: String(error.message || error).slice(0, 1500) } : classifyFailure(error).toJSON() }); else res.end(); }
  });
  server.requestTimeout = 120000;
  return server;
}
export function createBridgeRuntime({ cwd = process.cwd(), dataRoot = path.join(cwd, 'Skill Canvas Data'), tasksRoot = path.join(cwd, '.skill-canvas/tasks'), evidenceFile = path.join(cwd, 'work/phase3/image-probe-result.json'), executable = 'codex', port = 4717, token, allowedOrigins, onProcess = () => {}, onProcessExit = () => {} } = {}) {
  const client = new CodexClient({ cwd, executable });
  client.on('process', onProcess); client.on('process-exit', onProcessExit);
  const manager = new TaskManager({ client, projects: new ProjectStore(path.join(dataRoot, 'Projects')), workspaces: new TaskWorkspaces(tasksRoot), evidenceFile });
  manager.customization=new CustomizationStore(dataRoot);
  manager.portable=new PortableReader(dataRoot);
  manager.boot=manager.boot.then(async()=>{try{const preferences=await manager.customization.read();manager.pool.setLimit(preferences.workflow?.maxConcurrency||2);}catch{manager.emit('diagnostic',{event:'personal-settings-unavailable',code:'PERSONAL_SETTINGS_INVALID'});}});
  manager.skills = new SkillRegistry(path.join(dataRoot, 'Skills'), { validate: async (skillPath, name) => {
    // Validation is isolated: unconfirmed or rejected skills never enter the generation process.
    const validator = new CodexClient({ cwd, executable });
    validator.on('process', onProcess); validator.on('process-exit', onProcessExit);
    try {
    await validator.start();
    await validator.addSkillRoot(path.dirname(path.dirname(skillPath)));
    const response = await validator.request('skills/list', { cwds: [cwd], forceReload: true });
    const found = response.data.flatMap(entry => entry.skills).some(skill => skill.name === name && path.resolve(skill.path) === path.resolve(skillPath) && skill.enabled !== false);
    return { ready: found && (await manager.capabilities()).automaticImageGeneration, issue: found ? 'ImageGen 能力尚未验证。' : 'Codex 未识别此 Skill，请检查名称、frontmatter 与目录结构。' };
    } finally { validator.close(); }
  } });
  const server = createBridgeServer(manager, { port, token, allowedOrigins });
  return { manager, client, server };
}
if (!process.env.SKILL_CANVAS_DESKTOP && process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { server, client } = createBridgeRuntime();
  server.listen(4717, '127.0.0.1', () => console.log('Skill Canvas Local Bridge: http://127.0.0.1:4717 (ChatGPT login, no API key)'));
  const close = () => { client.close(); server.closeAllConnections(); server.close(() => process.exit(0)); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
  process.on('message', message => { if (message?.type === 'shutdown') close(); });
  process.on('disconnect', close);
}
