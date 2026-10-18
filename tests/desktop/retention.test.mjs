import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';import {initializeData} from '../../desktop/data.mjs';import {backupData,previewBackup} from '../../desktop/backup.mjs';import {pruneBackups} from '../../desktop/retention.mjs';
test('retention removes only inventoried application backups, leaving extra files and user folders untouched',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'canvas-retention-'));t.after(()=>rm(root,{recursive:true,force:true}));const source=path.join(root,'Skill Canvas Data');await initializeData(source,'1.5.0');
 const a=await backupData(source,root,'1.5.0',{automatic:true}),b=await backupData(source,root,'1.5.0',{automatic:true}),c=await backupData(source,root,'1.5.0',{automatic:true});await writeFile(path.join(a.path,'personal.txt'),'user file');
 const manual=await backupData(source,root,'1.5.0');const removed=await pruneBackups(root,1);await access(manual.path);assert.equal(removed.length,1);await access(a.path);await access(c.path);assert.equal(await readFile(path.join(a.path,'personal.txt'),'utf8'),'user file');await assert.rejects(access(b.path));
 const preview=await previewBackup(c.path);assert.equal(preview.drafts,false);assert.ok(preview.files>0);await assert.rejects(pruneBackups(root,0));
});
test('upgrade checkpoint preserves old critical settings and unknown settings schemas are not overwritten',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'canvas-upgrade-'));t.after(()=>rm(root,{recursive:true,force:true}));await initializeData(root,'1.5.0');await writeFile(path.join(root,'Settings/customization.json'),JSON.stringify({schema:99}));await assert.rejects(initializeData(root,'1.6.0'),/不受支持/);assert.equal(JSON.parse(await readFile(path.join(root,'Settings/version.json'))).appVersion,'1.5.0');
 await writeFile(path.join(root,'Settings/customization.json'),JSON.stringify({schema:1,revision:2}));await initializeData(root,'1.6.0');assert.equal(JSON.parse(await readFile(path.join(root,'Settings/customization.json'))).revision,2);
});
