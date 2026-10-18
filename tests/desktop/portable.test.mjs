import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PortableWriter,PortableReader} from '../../desktop/portable.mjs';
import {initializeData} from '../../desktop/data.mjs';
import {ensureDataIdentity} from '../../desktop/identity.mjs';
import {backupData,prepareRestore,commitRestore} from '../../desktop/backup.mjs';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const state=()=>({schema:2,settings:{skillRoots:[]},manifests:[],projects:[{id:randomUUID(),draft:{prompt:'keep prompt',requirements:'',references:[]},generations:[]}],activeProjectId:null});
async function fixture(t){const base=await mkdtemp(path.join(os.tmpdir(),'canvas-portable-'));t.after(()=>rm(base,{recursive:true,force:true}));const root=path.join(base,'Skill Canvas Data');await initializeData(root);return {base,root,writer:new PortableWriter(base)};}
test('portable draft hashes and receipts preserve byte-exact refs and prevent duplicate import',async t=>{
 const {writer,root}=await fixture(t),token=await writer.begin(state(),['asset:ref'],root);
 await assert.rejects(writer.finish(token),/缺失/);await assert.rejects(writer.add(token,{key:'asset:other',data:image.toString('base64')}),/无效/);
 await writer.add(token,{key:'asset:ref',data:image.toString('base64')});await writer.finish(token);await writer.copyTo(token,path.join(root,'Settings/PortableDrafts'));
 const reader=new PortableReader(root),metadata=await reader.metadata();assert.equal(metadata.state.projects[0].draft.prompt,'keep prompt');assert.deepEqual(Buffer.from((await reader.asset('asset:ref')).data,'base64'),image);
 await reader.consume(token);assert.equal(await new PortableReader(root).metadata(),null);await writer.release(token);
});
test('backup draft inclusion is optional, restore rotates cache identity and keeps original dataset',async t=>{
 const {writer,base,root}=await fixture(t),identity=await ensureDataIdentity(root),token=await writer.begin(state(),[],root);await writer.finish(token);
 const backup=await backupData(root,base,'1.6.0',{draftWriter:writer,draftToken:token});assert.equal(JSON.parse(await readFile(path.join(backup.path,'backup-manifest.json'))).draftCacheIncluded,true);
 const prepared=await prepareRestore(backup.path,root,'1.6.0'),result=await commitRestore(prepared),restored=await ensureDataIdentity(root),previous=await ensureDataIdentity(result.previous);
 assert.equal(restored.datasetId,identity.datasetId);assert.notEqual(restored.cacheId,identity.cacheId);assert.equal(previous.cacheId,identity.cacheId);assert.ok(await new PortableReader(root).metadata());
 const without=await backupData(root,base,'1.6.0');assert.equal(JSON.parse(await readFile(path.join(without.path,'backup-manifest.json'))).draftCacheIncluded,false);await writer.release(token);
});
test('identity relocation rewrites only owned metadata, keeping source Skill and human strings intact',async t=>{
 const {root}=await fixture(t),first=await ensureDataIdentity(root),folder=path.join(root,'Projects/p/metadata');await mkdir(folder,{recursive:true});const file=path.join(folder,'project.json');await writeFile(file,JSON.stringify({path:path.join(root,'Projects/p/output.png'),prompt:root}));
 const destination=path.join(path.dirname(root),'different','Skill Canvas Data');const next=await ensureDataIdentity(root,{logicalRoot:destination});assert.equal(next.cacheId,first.cacheId);const value=JSON.parse(await readFile(file));assert.ok(value.path.startsWith(destination));assert.equal(value.prompt,root);
});
test('tampered draft snapshot is rejected without consuming its manifest',async t=>{
 const {writer,root}=await fixture(t),token=await writer.begin(state(),[],root);await writer.finish(token);await writer.copyTo(token,path.join(root,'Settings/PortableDrafts'));await writeFile(path.join(root,'Settings/PortableDrafts/snapshot.json'),'{}');await assert.rejects(new PortableReader(root).metadata(),/Hash/);await writer.release(token);
});
