import path from 'node:path';
import {readFile,lstat,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {atomicJson,remap,safeExisting} from './data.mjs';
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
// Cache identity follows a dataset during migration, but rotates for point-in-time restore.
export async function ensureDataIdentity(root,{logicalRoot=root,rotateCache=false}={}){
 const file=path.join(root,'Settings/data-identity.json');let value;
 try{if((await lstat(file)).isSymbolicLink())throw Error('数据身份不能是链接。');value=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(value&&(value.schema!==1||!uuid.test(value.datasetId)||!uuid.test(value.cacheId)||!path.isAbsolute(value.directory||'')))throw Error('数据身份无效，原数据未覆盖。');
 if(value&&value.directory!==logicalRoot){
  const files=['Settings/customization.json'];
  for(const [kind,tail] of [['Projects','metadata/project.json'],['Skills','metadata/record.json'],['Tasks','record.json'],['Tasks','task.json']]){
   for(const entry of await readdir(path.join(root,kind),{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
    if(entry.isSymbolicLink())throw Error('数据元目录不能含链接。');if(entry.isDirectory())files.push(kind+'/'+entry.name+'/'+tail);
   }
  }
  for(const relative of files){const target=path.join(root,relative);let bytes;try{if((await lstat(target)).isSymbolicLink())throw Error('元数据不能是链接。');bytes=await readFile(await safeExisting(root,target),'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}await atomicJson(target,remap(JSON.parse(bytes),[[value.directory,logicalRoot]]));}
 }
 const next={schema:1,datasetId:value?.datasetId||randomUUID(),cacheId:rotateCache?randomUUID():value?.cacheId||randomUUID(),directory:logicalRoot};
 await atomicJson(file,next);return next;
}
