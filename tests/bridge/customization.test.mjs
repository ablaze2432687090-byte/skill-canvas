import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {CustomizationStore} from '../../bridge/server/customization.mjs';
import {defaultCustomization} from '../../src/domain/customization.ts';
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'canvas-personal-'));t.after(async()=>{if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup');await rm(root,{recursive:true,force:true});});return {root,store:new CustomizationStore(root)};}
test('personal settings persist atomically; stale concurrent writes cannot overwrite the winner',async t=>{
 const {store}=await fixture(t),initial=await store.read();const saved=await store.write({...initial,skills:{sample:{pinned:true}}});assert.equal(saved.revision,1);await assert.rejects(store.write(initial),/其他位置更改/);assert.equal((await new CustomizationStore(store.root).read()).skills.sample.pinned,true);
});
test('corrupt settings remain untouched and do not silently reset to defaults',async t=>{
 const {root,store}=await fixture(t);await mkdir(path.join(root,'Settings'));await writeFile(store.file,'broken');await assert.rejects(store.read());await assert.rejects(store.write(defaultCustomization()));assert.equal(await readFile(store.file,'utf8'),'broken');
});
test('personal PNGs are content-addressed, verified and cannot read arbitrary files',async t=>{
 const {store}=await fixture(t),bytes=await readFile('public/artwork/category-photo.png');const media=await store.upload({data:bytes.toString('base64')});assert.ok(media.width>0);assert.deepEqual(Buffer.from((await store.media(media.id)).data,'base64'),bytes);await assert.rejects(store.media('../../private'));await assert.rejects(store.upload({data:'broken'}));await writeFile(path.join(store.directory,'Media',media.id+'.png'),'tampered');await assert.rejects(store.media(media.id),/完整性/);
});
test('personal settings reject linked Settings directories without following them',async t=>{
 const {root,store}=await fixture(t),outside=path.join(root,'outside');await mkdir(outside);await symlink(outside,path.join(root,'Settings'),process.platform==='win32'?'junction':'dir');await assert.rejects(store.read(),/符号链接/);await assert.rejects(store.write(defaultCustomization()),/符号链接/);
});
