import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeServer } from '../../bridge/server/index.mjs';
import { TaskManager } from '../../bridge/server/tasks.mjs';
import { EventEmitter } from 'node:events';
test('桌面 Bridge 随机本机端口、只允许固定 app origin，并保留 Token 校验',async t=>{
 const manager={boot:Promise.resolve(),status:async()=>({connected:false})};
 const server=createBridgeServer(manager,{port:0,allowedOrigins:['app://canvas'],token:'desktop-test-token'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 assert.equal(server.address().address,'127.0.0.1');
 assert.equal((await fetch(base+'/session',{headers:{Origin:'http://evil.invalid'}})).status,403);
 assert.equal((await fetch(base+'/session',{headers:{Origin:'http://127.0.0.1:5173'}})).status,403);
 assert.equal((await fetch(base+'/status',{headers:{Origin:'app://canvas'}})).status,401);
 assert.deepEqual(await(await fetch(base+'/session',{headers:{Origin:'app://canvas'}})).json(),{token:'desktop-test-token'});
 assert.equal((await fetch(base+'/status',{headers:{Origin:'app://canvas','X-Skill-Canvas-Token':'desktop-test-token'}})).status,200);
});
test('Codex 缺失不阻塞受管 Skill catalog 与历史项目读取',async()=>{
 const client=new EventEmitter();client.start=async()=>{throw new Error('missing codex');};
 const projects={all:async()=>[{id:'p',tasks:[]}]},workspaces={all:async()=>[]};
 const manager=new TaskManager({client,projects,workspaces});manager.skills={list:async()=>[{id:'managed-existing',installation:{installed:true}}]};
 const catalog=await manager.catalog();assert.ok(catalog.some(s=>s.id==='managed-existing'));assert.deepEqual(await manager.projectList(),[{id:'p',management:undefined,tasks:[]}]);assert.equal((await manager.status()).connected,false);
});

test('从备份恢复的历史图片不能冒充本机已验证 ImageGen 能力',async()=>{
 const client=new EventEmitter(),task={taskId:'restored',stage:'completed',sawImageGeneration:true,capabilityEvidenceInvalidated:true,result:{version:1,outputs:[{path:'original.png',sha256:'historical'}]}};
 const projects={all:async()=>[{tasks:[task]}],bytes:async()=>{throw Error('恢复的旧任务不应被用作本机能力证据');}},workspaces={all:async()=>[]};
 const manager=new TaskManager({client,projects,workspaces,evidenceFile:'nonexistent-evidence-for-test'});assert.equal((await manager.capabilities()).automaticImageGeneration,false);
});
