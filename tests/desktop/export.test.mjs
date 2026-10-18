import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
const {exportName,exportOriginals}=createRequire(import.meta.url)('../../desktop/export.cjs');
test('export names cannot escape selected directories or use Windows device names',()=>{for(const value of ['../secret','C:\\secret','CON','a/b','a:*.png']){const name=exportName(value);assert.equal(/[<>:"/\\|?*]/.test(name),false);assert.equal(/^(con|nul|prn)(\.|$)/i.test(name),false);}});
test('bulk export keeps exact original bytes and reports individual failures without replacing files',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'canvas-export-'));t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(root,{recursive:true,force:true});});
 const bytes=await readFile('public/artwork/category-photo.png'),sha256=createHash('sha256').update(bytes).digest('hex'),progress=[];
 const result=await exportOriginals({directory:root,projects:[{id:'first',management:{title:'My Work'},tasks:[{taskId:'task',stage:'completed',startedAt:'2026-01-01',result:{version:3,outputs:[{id:'output',sha256}]}}]},{id:'draft',tasks:[]}],readOutput:async()=>bytes,onProgress:p=>progress.push(p)});
 assert.equal(result.files,1);assert.equal(result.failures[0].id,'draft');assert.deepEqual(progress.at(-1),{completed:2,total:2});const filename=(await readdir(result.path)).find(name=>name.endsWith('.png'));assert.deepEqual(await readFile(path.join(result.path,filename)),bytes);
 const second=await exportOriginals({directory:root,projects:[],readOutput:async()=>bytes});assert.notEqual(second.path,result.path);
});
