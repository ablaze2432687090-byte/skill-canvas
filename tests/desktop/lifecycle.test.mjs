import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const file=new URL('../../desktop/main.cjs',import.meta.url),nodeRequire=createRequire(file);
async function main(onKill){
 const electron={dialog:{showMessageBox(){},showOpenDialog(){},showSaveDialog(){}},app:{setName(){},getPath:()=>process.cwd(),setPath(){},requestSingleInstanceLock:()=>true,getAppPath:()=>process.cwd(),on(){},whenReady:()=>new Promise(()=>{})},protocol:{registerSchemesAsPrivileged(){}}};
 const context=vm.createContext({require:name=>name==='electron'?electron:name==='node:child_process'&&onKill?{execFile:(file,args,_options,done)=>{onKill(file,args);queueMicrotask(()=>done(null,''));}}:nodeRequire(name),process:{env:{}},setTimeout,clearTimeout,setInterval,clearInterval,Buffer,URL,__dirname:process.cwd()});
 vm.runInContext(await readFile(file,'utf8')+'\nglobalThis.probe={stop:stopBridge,planned:()=>plannedStop,setChild:value=>{child=value;},owned:pid=>ownedCodex.add(pid),gone:bridgeGone,current:()=>child};',context);return context.probe;
}
test('第一次启动尚无 Bridge 时不能留下 plannedStop，后续崩溃必须视作意外',async()=>{const probe=await main();await probe.stop();assert.equal(probe.planned(),false);});
test('正常关闭 Bridge 等待自己子进程退出，并复位生命周期状态',async()=>{const probe=await main(),child=new EventEmitter();child.postMessage=message=>{assert.equal(message.type,'shutdown');queueMicrotask(()=>child.emit('exit',0));};probe.setChild(child);await probe.stop();assert.equal(probe.current(),null);assert.equal(probe.planned(),false);});

test('先停止本工具持有的 Codex 进程树，再关闭 Bridge，防止遗留目录锁',async()=>{
 const events=[],probe=await main((file,args)=>{events.push('kill');assert.equal(file,'taskkill.exe');assert.deepEqual(Array.from(args),['/PID','12345670','/T','/F']);}),child=new EventEmitter();
 child.postMessage=()=>{events.push('shutdown');queueMicrotask(()=>child.emit('exit',0));};probe.setChild(child);probe.owned(12345670);await probe.stop();assert.deepEqual(events,['kill','shutdown']);await probe.stop();assert.deepEqual(events,['kill','shutdown']);
});
