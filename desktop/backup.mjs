import path from 'node:path';
import {mkdir,readdir,lstat,readFile,writeFile,rename,realpath,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {contained,remap,initializeData} from './data.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function previewBackup(directory){
 const file=path.join(directory,'backup-manifest.json'),info=await lstat(file);if(info.isSymbolicLink()||!info.isFile()||info.size>32*1024*1024)throw Error('备份清单无效或过大。');
 const value=JSON.parse(await readFile(file,'utf8'));if(value.schema!==2||value.scope!=='formal-projects-skills-tasks-settings'||!Array.isArray(value.files)||value.files.length>200000)throw Error('备份格式不受支持。');
 const bytes=value.files.reduce((sum,item)=>{if(!Number.isSafeInteger(item.bytes)||item.bytes<0)throw Error('备份文件大小无效。');return sum+item.bytes;},0);
 return {files:value.files.length,bytes,projects:new Set(value.files.map(f=>/^Projects\/([^/]+)\//.exec(f.path)?.[1]).filter(Boolean)).size,drafts:value.draftCacheIncluded===true};
}
async function renameUnlocked(from,to){for(let attempt=0;;attempt++){try{return await rename(from,to);}catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=12)throw error;await delay(150+attempt*50);}}}
export async function backupData(source,parent,version,{draftWriter,draftToken,automatic=false}={}){
 source=await realpath(source);parent=await realpath(parent);
 if(parent===source||contained(source,parent))throw Error('备份位置不能与应用数据目录相同、嵌套或重叠。');
 const name='Skill-Canvas-Backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8),stage=path.join(parent,'.'+name+'.partial'),target=path.join(parent,name),files=[];
 await mkdir(stage,{recursive:false});
 async function copy(from,to){if(path.relative(source,from).replaceAll('\\','/')==='Settings/PortableDrafts')return;const stat=await lstat(from);if(stat.isSymbolicLink())throw Error('数据含链接，备份未完成；未跟随链接读取外部文件。');if(stat.isDirectory()){await mkdir(to,{recursive:true});for(const name of await readdir(from))await copy(path.join(from,name),path.join(to,name));}else if(stat.isFile()){const bytes=await readFile(from);await writeFile(to,bytes,{flag:'wx'});const sha256=hash(bytes);if(hash(await readFile(to))!==sha256)throw Error('备份文件校验失败。');files.push({path:path.relative(stage,to).replaceAll('\\','/'),sha256,bytes:bytes.length});}else throw Error('备份遇到非普通文件。');}
 for(const kind of ['Projects','Skills','Tasks','Settings']){const folder=path.join(source,kind);if(await lstat(folder).catch(()=>null))await copy(folder,path.join(stage,kind));}
 if(draftToken){if(!draftWriter)throw Error('草稿快照服务不可用。');const folder=await draftWriter.copyTo(draftToken,path.join(stage,'Settings/PortableDrafts'));async function record(directory){for(const name of await readdir(directory)){const file=path.join(directory,name),info=await lstat(file);if(info.isSymbolicLink())throw Error('草稿副本不能含链接。');if(info.isDirectory())await record(file);else{const bytes=await readFile(file);files.push({path:path.relative(stage,file).replaceAll('\\','/'),sha256:hash(bytes),bytes:bytes.length});}}}await record(folder);}
 const report={schema:2,sourceRoot:source,appVersion:version,createdAt:new Date().toISOString(),scope:'formal-projects-skills-tasks-settings',automatic:automatic===true,draftCacheIncluded:!!draftToken,codexCredentialsIncluded:false,files};
 await writeFile(path.join(stage,'backup-manifest.json'),JSON.stringify(report,null,2),{flag:'wx'});await rename(stage,target);return {path:target,files:files.length};
}

export async function prepareRestore(backup,target,version){
 backup=await realpath(backup);target=path.resolve(target);
 const parent=await realpath(path.dirname(target));target=path.join(parent,path.basename(target));
 if(backup===target||contained(target,backup)||contained(backup,target))throw Error('备份与数据目录不能重叠。');
 if((await lstat(path.join(backup,'backup-manifest.json'))).isSymbolicLink())throw Error('备份清单不能是链接。');
 const report=JSON.parse(await readFile(path.join(backup,'backup-manifest.json'),'utf8'));
 if(report.schema!==2||!path.isAbsolute(report.sourceRoot||'')||report.scope!=='formal-projects-skills-tasks-settings'||!Array.isArray(report.files)||report.files.length>200000)throw Error('备份格式不受支持，请使用 1.2.0 或更新版本创建的完整备份。');
 const stage=path.join(parent,'Restore-'+randomUUID()),seen=new Set();await mkdir(stage);
 try{
  for(const entry of report.files){
   const rel=entry.path;
   if(typeof rel!=='string'||! /^(Projects|Skills|Tasks|Settings)\//.test(rel)||rel.split('/').some(s=>!s||s==='.'||s==='..'||/[\\:*?"<>|\x00-\x1f]/.test(s)||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s))||seen.has(rel.toLowerCase())||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256||''))throw Error('备份清单包含不安全或重复路径。');
   seen.add(rel.toLowerCase());let from=backup;
   for(const part of rel.split('/')){from=path.join(from,part);if((await lstat(from)).isSymbolicLink())throw Error('备份包含链接，拒绝恢复。');}
   if(!(await lstat(from)).isFile())throw Error('备份文件类型无效。');
   const bytes=await readFile(from);if(bytes.length!==entry.bytes||hash(bytes)!==entry.sha256)throw Error('备份文件缺失或 Hash 校验失败：'+rel);
   let output=bytes;
   // Rebase only execution metadata, never historical prompts or immutable Skill resources.
   if(/^(Projects\/[^/]+\/metadata\/project\.json|Skills\/[^/]+\/metadata\/record\.json|Tasks\/[^/]+\/(record|task)\.json)$/.test(rel)){
    const metadata=remap(JSON.parse(bytes),[[report.sourceRoot,target]]);
    if(rel.startsWith('Projects/')&&Array.isArray(metadata.tasks))for(const task of metadata.tasks)task.capabilityEvidenceInvalidated=true;
    if(/^Tasks\/[^/]+\/record\.json$/.test(rel))metadata.capabilityEvidenceInvalidated=true;
    output=Buffer.from(JSON.stringify(metadata,null,2));
   }
   if(rel==='Settings/image-probe-result.json'||rel==='Settings/desktop.json')continue;
   const to=path.join(stage,rel);await mkdir(path.dirname(to),{recursive:true});await writeFile(to,output,{flag:'wx'});
   if(hash(await readFile(to))!==hash(output))throw Error('恢复暂存文件校验失败。');
  }
  await initializeData(stage,version);
  await (await import('./identity.mjs')).ensureDataIdentity(stage,{logicalRoot:target,rotateCache:true});
  // Keep this machine's program paths/theme, never import another user's executable path.
  const current=await readFile(path.join(target,'Settings/desktop.json'),'utf8').then(JSON.parse).catch(()=>({}));
  await writeFile(path.join(stage,'Settings/desktop.json'),JSON.stringify({...current,onboardingComplete:false},null,2));
  return {stage,target,files:seen.size};
 }catch(error){await rm(stage,{recursive:true,force:true});throw error;}
}

export async function commitRestore(prepared){
 const {stage,target}=prepared,parent=path.dirname(target);
 if(path.dirname(stage)!==parent||!/^Restore-[a-f0-9-]{36}$/.test(path.basename(stage)))throw Error('恢复暂存路径无效。');
 const info=await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(info?.isSymbolicLink())throw Error('当前数据目录不能是链接。');
 const previous=info?path.join(parent,'Before-Restore-'+randomUUID()):null;
 if(previous)await renameUnlocked(target,previous);
 try{await renameUnlocked(stage,target);}catch(error){if(previous)await renameUnlocked(previous,target);throw error;}
 return {path:target,files:prepared.files,previous};
}
