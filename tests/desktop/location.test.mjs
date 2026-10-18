import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,lstat} from 'node:fs/promises';
import {migrateDataLocation,loadDataLocation,saveDataLocation} from '../../desktop/location.mjs';
import {initializeData} from '../../desktop/data.mjs';
async function fixture(t){const base=await mkdtemp(path.join(os.tmpdir(),'canvas-location-'));t.after(async()=>{assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(base,{recursive:true,force:true});});const source=path.join(base,'old','Skill Canvas Data'),parent=path.join(base,'new'),profile=path.join(base,'profile');await mkdir(parent,{recursive:true});await mkdir(profile);await initializeData(source,'1.5.0');return {source,parent,profile};}
test('data location migration verifies bytes, rebases metadata only and preserves original and raw prompts',async t=>{
 const {source,parent,profile}=await fixture(t),metadata=path.join(source,'Projects/project/metadata');await mkdir(metadata,{recursive:true});const text=source+'\\this is user text';await writeFile(path.join(metadata,'project.json'),JSON.stringify({path:path.join(source,'Projects/project/input/ref.png'),prompt:text,instruction:text}));await mkdir(path.join(source,'Skills/raw'),{recursive:true});await writeFile(path.join(source,'Skills/raw/style.json'),JSON.stringify({path:source}));
 const progress=[],result=await migrateDataLocation(source,parent,{version:'1.6.0',onProgress:event=>progress.push(event)});const restored=JSON.parse(await readFile(path.join(result.target,'Projects/project/metadata/project.json'),'utf8'));assert.ok(restored.path.startsWith(result.target));assert.equal(restored.prompt,text);assert.equal(restored.instruction,text);assert.equal(await readFile(path.join(result.target,'Skills/raw/style.json'),'utf8'),JSON.stringify({path:source}));assert.ok(await lstat(source));assert.equal(progress.at(-1).stage,'completed');await saveDataLocation(profile,result.target);assert.equal(await loadDataLocation(profile,source),result.target);
});
test('overlap, insufficient space, existing destination and linked inputs never switch data roots',async t=>{
 const {source,parent,profile}=await fixture(t);await assert.rejects(migrateDataLocation(source,path.dirname(source)),/重叠/);await assert.rejects(migrateDataLocation(source,parent,{space:async()=>({bavail:0n,bsize:4096n})}),/空间不足/);assert.equal(await loadDataLocation(profile,source),source);await mkdir(path.join(parent,'Skill Canvas Data'));await assert.rejects(migrateDataLocation(source,parent),/已经存在/);
 const other=path.join(source,'Cache/link');await symlink(parent,other,process.platform==='win32'?'junction':'dir');const second=path.join(parent,'second');await mkdir(second);await assert.rejects(migrateDataLocation(source,second),/链接/);
});
