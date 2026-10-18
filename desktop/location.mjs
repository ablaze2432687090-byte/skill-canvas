import path from 'node:path';
import {mkdir,lstat,readdir,realpath,statfs,copyFile,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {atomicJson,contained,initializeData,remap,safeExisting} from './data.mjs';
const metadata=/^(Projects\/[^/]+\/metadata\/project\.json|Skills\/[^/]+\/metadata\/record\.json|Tasks\/[^/]+\/(record|task)\.json|Settings\/(desktop|customization)\.json)$/;
const hash=async file=>{const digest=createHash('sha256');for await(const bytes of createReadStream(file))digest.update(bytes);return digest.digest('hex');};
export async function validateDataLocation(value){
 if(typeof value!=='string'||!path.isAbsolute(value)||! /^(Skill Canvas Data|Before-Restore-[a-f\d-]{36})$/i.test(path.basename(value)))throw Error('请选择有效的 Skill Canvas Data 目录。');
 const info=await lstat(value);if(info.isSymbolicLink()||!info.isDirectory())throw Error('数据目录不能是链接或普通文件。');
 const root=await realpath(value),marker=await safeExisting(root,path.join(root,'Settings/version.json'));
 const version=JSON.parse(await readFile(marker,'utf8'));if(version.dataSchemaVersion!==1)throw Error('数据版本不受支持，未覆盖任何文件。');return root;
}
export async function loadDataLocation(profile,fallback){
 const file=path.join(profile,'data-location.json');let saved;try{if((await lstat(file)).isSymbolicLink())throw Error('数据位置配置不能是链接。');saved=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}
 if(saved.schema!==1)throw Error('数据位置配置不受支持。');return validateDataLocation(saved.directory);
}
export async function saveDataLocation(profile,directory){const root=await validateDataLocation(directory);await atomicJson(path.join(profile,'data-location.json'),{schema:1,directory:root,updatedAt:new Date().toISOString()});return root;}
export async function migrateDataLocation(source,parent,{version,space=statfs,onProgress=()=>{}}={}){
 source=await validateDataLocation(source);parent=await realpath(parent);const target=path.join(parent,'Skill Canvas Data');
 if(target===source||parent===source||contained(source,parent)||contained(target,source))throw Error('迁移目标不能与当前数据目录重叠。');
 if(await lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))throw Error('目标数据目录已经存在，请选择其他位置，不会覆盖。');
 const entries=[];let totalBytes=0;
 async function scan(directory){for(const name of await readdir(directory)){const file=path.join(directory,name),info=await lstat(file);if(info.isSymbolicLink())throw Error('数据包含链接，迁移已取消。');if(info.isDirectory())await scan(file);else if(info.isFile()){entries.push({file,relative:path.relative(source,file),bytes:info.size});totalBytes+=info.size;if(entries.length>200000)throw Error('数据文件过多，请先整理后迁移。');}else throw Error('数据包含不支持的文件类型。');}}
 await scan(source);const disk=await space(parent,{bigint:true});const free=BigInt(disk.bavail)*BigInt(disk.bsize);if(free<BigInt(totalBytes)+64n*1024n*1024n)throw Error('目标磁盘空间不足，尚未复制任何数据。');
 const stage=path.join(parent,'.Skill-Canvas-Migrate-'+randomUUID());if(!contained(parent,stage))throw Error('迁移暂存路径越界。');await mkdir(stage);
 let copiedBytes=0;
 try{
  for(const [index,entry] of entries.entries()){
   const destination=path.join(stage,entry.relative);if(!contained(stage,destination))throw Error('迁移文件路径越界。');await mkdir(path.dirname(destination),{recursive:true});await copyFile(entry.file,destination,1);
   if(await hash(entry.file)!==await hash(destination))throw Error('迁移文件校验失败，原目录仍保留。');copiedBytes+=entry.bytes;onProgress({stage:'copying',completed:index+1,total:entries.length,copiedBytes,totalBytes});
  }
  for(const entry of entries){const relative=entry.relative.replaceAll('\\','/');if(!metadata.test(relative))continue;if(entry.bytes>64*1024*1024)throw Error('元数据过大，迁移未提交。');const file=path.join(stage,entry.relative),rebased=remap(JSON.parse(await readFile(file,'utf8')),[[source,target]]);await writeFile(file,JSON.stringify(rebased,null,2));if(JSON.stringify(JSON.parse(await readFile(file,'utf8')))!==JSON.stringify(rebased))throw Error('迁移元数据校验失败。');}
  await initializeData(stage,version);const report={schema:1,createdAt:new Date().toISOString(),source,target,files:entries.length,bytes:totalBytes,originalsPreserved:true};await atomicJson(path.join(stage,'Settings/data-migration.json'),report);
  if(await lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))throw Error('迁移期间目标目录已出现，未覆盖。');await rename(stage,target);onProgress({stage:'completed',completed:entries.length,total:entries.length,copiedBytes,totalBytes});return report;
 }catch(error){if(contained(parent,stage)&&/^\.Skill-Canvas-Migrate-[a-f\d-]{36}$/.test(path.basename(stage)))await rm(stage,{recursive:true,force:true}).catch(()=>{});throw error;}
}
