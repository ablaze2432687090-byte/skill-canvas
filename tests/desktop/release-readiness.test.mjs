import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseDocument} from 'yaml';
import {discoverCodex,resolveCodexExecutable} from '../../desktop/environment.mjs';
import {backupData,prepareRestore,commitRestore} from '../../desktop/backup.mjs';
import {initializeData,exists} from '../../desktop/data.mjs';
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'canvas-release-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('npm shim 解析到匹配架构的二进制，不执行命令脚本',async t=>{
 const root=await fixture(t),shim=path.join(root,'codex.cmd'),binary=path.join(root,'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex/codex.exe');
 await mkdir(path.dirname(binary),{recursive:true});await writeFile(shim,'must never execute');await writeFile(binary,'fixture');
 assert.equal(await resolveCodexExecutable(shim,{exists,arch:'x64'}),binary);
 await assert.rejects(resolveCodexExecutable(shim,{exists,arch:'arm64'}),/原生程序/);
 const called=[];assert.equal(await discoverCodex({env:{LOCALAPPDATA:root},exists,execute:async(_file,args)=>{called.push(args[0]);return {stdout:args[0]==='codex.cmd'?shim:''};}}),binary);assert.deepEqual(called,['codex.exe','codex.cmd']);
});
test('损坏的 npm shim 不阻止寻找后续已安装原生程序',async t=>{
 const root=await fixture(t),binary=path.join(root,'OpenAI/Codex/bin/test/codex.exe'),shim=path.join(root,'codex.cmd');await mkdir(path.dirname(binary),{recursive:true});await writeFile(binary,'fixture');await writeFile(shim,'');
 assert.equal(await discoverCodex({env:{LOCALAPPDATA:root},exists,execute:async()=>({stdout:shim})}),binary);
 await assert.rejects(resolveCodexExecutable(path.join(root,'other.cmd'),{exists}),/Codex/);
});
test('恶意深层 YAML 返回解析错误而不是堆栈溢出',()=>{
 assert.doesNotThrow(()=>parseDocument('['.repeat(10000)+']'.repeat(10000)));
 assert.ok(parseDocument('['.repeat(10000)+']'.repeat(10000)).errors.length>0);
});
test('允许备份到数据目录的父目录，新备份为独立兄弟目录',async t=>{
 const root=await fixture(t),source=path.join(root,'data');await initializeData(source);const backup=await backupData(source,root,'1.2.0');assert.equal(path.dirname(backup.path),root);assert.notEqual(backup.path,source);
});
async function restoreFixture(t){
 const root=await fixture(t),source=path.join(root,'original'),target=path.join(root,'current');await initializeData(source);await initializeData(target);
 await mkdir(path.join(source,'Projects/test/metadata'),{recursive:true});await writeFile(path.join(source,'Projects/test/metadata/project.json'),JSON.stringify({input:path.join(source,'Projects/test/input.png'),prompt:'keep text'}));await writeFile(path.join(source,'Projects/test/input.png'),'unchanged image bytes');
 await writeFile(path.join(source,'Settings/desktop.json'),JSON.stringify({codexPath:'other-machine.exe',theme:'light'}));await writeFile(path.join(source,'Settings/image-probe-result.json'),'untrusted old proof');await writeFile(path.join(target,'Projects/previous'),'keep me');await writeFile(path.join(target,'Settings/desktop.json'),JSON.stringify({codexPath:'this-machine.exe',theme:'dark'}));
 const backup=await backupData(source,root,'1.2.0');return {root,source,target,backup:backup.path};
}
test('恢复校验 Hash、重映射元数据、保留旧库且不继承外机程序与图片能力',async t=>{
 const {source,target,backup}=await restoreFixture(t),prepared=await prepareRestore(backup,target,'1.2.0');assert.equal(await readFile(path.join(target,'Projects/previous'),'utf8'),'keep me');
 const result=await commitRestore(prepared);assert.equal(await readFile(path.join(result.previous,'Projects/previous'),'utf8'),'keep me');assert.equal(await readFile(path.join(target,'Projects/test/input.png'),'utf8'),'unchanged image bytes');
 const metadata=JSON.parse(await readFile(path.join(target,'Projects/test/metadata/project.json'),'utf8'));assert.equal(metadata.input,path.join(target,'Projects/test/input.png'));assert.equal(metadata.prompt,'keep text');assert.ok(!metadata.input.startsWith(source));
 const settings=JSON.parse(await readFile(path.join(target,'Settings/desktop.json'),'utf8'));assert.equal(settings.codexPath,'this-machine.exe');assert.equal(settings.onboardingComplete,false);assert.equal(await exists(path.join(target,'Settings/image-probe-result.json')),false);
});
test('损坏的备份不会覆盖当前数据，也不留下恢复暂存',async t=>{
 const {root,target,backup}=await restoreFixture(t);await writeFile(path.join(backup,'Projects/test/input.png'),'tampered');await assert.rejects(prepareRestore(backup,target,'1.2.0'),/Hash/);assert.equal(await readFile(path.join(target,'Projects/previous'),'utf8'),'keep me');assert.ok(!(await readdir(root)).some(n=>n.startsWith('Restore-')));
});
test('恢复拒绝路径穿越、重复条目和链接',async t=>{
 const {root,target,backup}=await restoreFixture(t),manifestFile=path.join(backup,'backup-manifest.json'),original=JSON.parse(await readFile(manifestFile,'utf8'));
 for(const rel of ['Projects/../../outside','Projects/test:ads','Projects/CON.txt','Projects/file.']){const bad=structuredClone(original);bad.files[0].path=rel;await writeFile(manifestFile,JSON.stringify(bad));await assert.rejects(prepareRestore(backup,target,'1.2.0'),/不安全/);}
 const duplicate=structuredClone(original);duplicate.files.push(duplicate.files[0]);await writeFile(manifestFile,JSON.stringify(duplicate));await assert.rejects(prepareRestore(backup,target,'1.2.0'),/重复/);
 await writeFile(manifestFile,JSON.stringify(original));await rm(path.join(backup,'Projects/test'),{recursive:true});await symlink(path.join(root,'original/Projects/test'),path.join(backup,'Projects/test'),process.platform==='win32'?'junction':'dir');await assert.rejects(prepareRestore(backup,target,'1.2.0'),/链接/);
});
