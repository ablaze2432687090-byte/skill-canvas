import path from 'node:path';
import {mkdir,lstat,readFile,writeFile,copyFile,readdir,rename,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {contained} from './data.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const filename=/^[a-f\d]{64}\.(png|jpg|webp)$/;
const imageMime=bytes=>bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
function stateCheck(value){
 if(!value||value.schema!==2||!Array.isArray(value.projects)||value.projects.length>10000||!Array.isArray(value.manifests)||value.manifests.length>2000||!value.settings||Array.isArray(value.settings)||typeof value.settings!=='object'||!Array.isArray(value.settings.skillRoots))throw Error('草稿快照结构无效。');
 for(const manifest of value.manifests)if(!manifest||typeof manifest.id!=='string'||!manifest.installation||typeof manifest.installation.id!=='string'||!manifest.source||!manifest.runtime||!Array.isArray(manifest.inputs)||!Array.isArray(manifest.outputs)||!Array.isArray(manifest.parameters)||!Array.isArray(manifest.examples)||!manifest.version||typeof manifest.instructions!=='string')throw Error('草稿 Skill 快照结构无效。');
 if(Object.keys(value).some(key=>!['schema','dataRoot','settings','manifests','projects','activeProjectId','projectGroups','groupMetadataVersion','importedSnapshot'].includes(key)))throw Error('草稿快照含未知字段。');
 for(const project of value.projects)if(!uuid.test(project.id)||!project.draft||typeof project.draft.prompt!=='string'||typeof project.draft.requirements!=='string'||!Array.isArray(project.draft.references)||project.draft.references.length>6||!Array.isArray(project.generations)||project.generations.length)throw Error('草稿项目结构无效。');
 const encoded=Buffer.from(JSON.stringify(value));if(encoded.length>32*1024*1024)throw Error('草稿元数据超过 32 MB，请先整理。');return encoded;
}
async function safeDirectory(root){const info=await lstat(root).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(info?.isSymbolicLink()||info&&!info.isDirectory())throw Error('草稿目录不能是链接或普通文件。');}
export class PortableWriter {
 constructor(profile){this.root=path.join(profile,'Backup-Staging');this.sessions=new Map();}
 async cleanExpired(){
  await safeDirectory(this.root);let entries;try{entries=await readdir(this.root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){if(!entry.isDirectory()||entry.isSymbolicLink()||!uuid.test(entry.name))continue;const directory=path.join(this.root,entry.name);if(Date.now()-(await lstat(directory)).mtimeMs<86400000)continue;
   const names=await readdir(directory);if(names.some(name=>!['snapshot.json','manifest.json','assets'].includes(name)))continue;
   try{for(const name of names)if((await lstat(path.join(directory,name))).isSymbolicLink())throw Error();stateCheck(JSON.parse(await readFile(path.join(directory,'snapshot.json'),'utf8')));const assets=await readdir(path.join(directory,'assets'),{withFileTypes:true});if(assets.some(asset=>!asset.isFile()||asset.isSymbolicLink()||!filename.test(asset.name)))continue;if(contained(this.root,directory))await rm(directory,{recursive:true,force:false});}catch{/* Unknown or damaged directories remain available for manual inspection. */}
  }
 }
 async begin(state,requiredAssets,sourceRoot){
  for(const [token,session] of this.sessions)if(Date.now()-session.created>30*60*1000)await this.release(token);
  if(this.sessions.size>=1)throw Error('已有草稿快照正在准备。');
  const bytes=stateCheck(state);if(!Array.isArray(requiredAssets)||requiredAssets.length>20000||requiredAssets.some(key=>typeof key!=='string'||!key.startsWith('asset:')||key.length>1024||/[\x00-\x1f]/.test(key)))throw Error('草稿图片索引无效。');
  await safeDirectory(this.root);await mkdir(this.root,{recursive:true});const token=randomUUID(),directory=path.join(this.root,token);await mkdir(directory);await mkdir(path.join(directory,'assets'));await writeFile(path.join(directory,'snapshot.json'),bytes,{flag:'wx'});
  this.sessions.set(token,{directory,sourceRoot,created:Date.now(),snapshotHash:digest(bytes),required:[...new Set(requiredAssets)],assets:new Map(),bytes:0,ready:false});return token;
 }
 session(token){if(!uuid.test(token||''))throw Error('草稿会话无效。');const session=this.sessions.get(token);if(!session)throw Error('草稿会话已过期。');return session;}
 async add(token,input){
  const session=this.session(token);if(session.ready||typeof input?.key!=='string'||!session.required.includes(input.key)||typeof input.data!=='string'||input.data.length>12*1024*1024)throw Error('草稿图片请求无效。');
  const bytes=Buffer.from(input.data,'base64'),mime=imageMime(bytes);if(!mime||bytes.length>8*1024*1024)throw Error('草稿图片格式无效或超过 8 MB。');
  const sha256=digest(bytes),name=sha256+'.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime]),old=session.assets.get(input.key);if(old&&old.sha256!==sha256)throw Error('草稿图片在备份期间变化，请重试。');
  if(session.bytes+bytes.length>2*1024*1024*1024)throw Error('未提交草稿图片总量超过 2 GB，请先整理后备份。');
  const file=path.join(session.directory,'assets',name);try{await writeFile(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||digest(await readFile(file))!==sha256)throw error;}
  if(!old){session.bytes+=bytes.length;session.assets.set(input.key,{key:input.key,file:name,mime,sha256,bytes:bytes.length});}return {completed:session.assets.size,total:session.required.length};
 }
 async finish(token){const session=this.session(token);if(session.required.some(key=>!session.assets.has(key)))throw Error('草稿图片缺失，未提交快照。');
  const manifest={schema:1,id:token,sourceRoot:session.sourceRoot,createdAt:new Date().toISOString(),snapshotHash:session.snapshotHash,assets:[...session.assets.values()]};await writeFile(path.join(session.directory,'manifest.json'),JSON.stringify(manifest),{flag:'wx'});session.ready=true;return {token,assets:session.assets.size,bytes:session.bytes};
 }
 async copyTo(token,target){
  const session=this.session(token);if(!session.ready)throw Error('草稿快照尚未完成。');await safeDirectory(path.dirname(target));await safeDirectory(target);
  if(await lstat(target).catch(()=>null))throw Error('草稿目标已存在，未覆盖。');await mkdir(path.join(target,'assets'),{recursive:true});
  for(const relative of ['snapshot.json','manifest.json',...new Set([...session.assets.values()].map(asset=>'assets/'+asset.file))]){const from=path.join(session.directory,relative),to=path.join(target,relative),bytes=await readFile(from);await copyFile(from,to,1);if(digest(await readFile(to))!==digest(bytes))throw Error('草稿副本校验失败。');}
  return target;
 }
 async release(token){const session=this.sessions.get(token);if(!session)return;if(!uuid.test(token)||!contained(this.root,session.directory)||path.basename(session.directory)!==token)throw Error('草稿清理路径越界。');await rm(session.directory,{recursive:true,force:true});this.sessions.delete(token);}
}
export class PortableReader {
 constructor(dataRoot){this.root=dataRoot;this.directory=path.join(dataRoot,'Settings','PortableDrafts');this.cached=null;}
 async metadata(){
  if(this.cached)return this.cached;await safeDirectory(path.join(this.root,'Settings'));await safeDirectory(this.directory);const file=path.join(this.directory,'manifest.json');
  let manifest;try{if((await lstat(file)).isSymbolicLink())throw Error('草稿清单不能是链接。');manifest=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(manifest.schema!==1||!uuid.test(manifest.id)||!Array.isArray(manifest.assets)||manifest.assets.length>20000||!path.isAbsolute(manifest.sourceRoot||'')||!/^[a-f\d]{64}$/.test(manifest.snapshotHash||''))throw Error('草稿备份格式不受支持。');
  const receipt=await readFile(path.join(this.root,'Settings','portable-import.json'),'utf8').then(JSON.parse).catch(()=>null);if(receipt?.id===manifest.id)return null;
  const snapshot=path.join(this.directory,'snapshot.json');if((await lstat(snapshot)).isSymbolicLink())throw Error('草稿快照不能是链接。');const bytes=await readFile(snapshot);if(digest(bytes)!==manifest.snapshotHash)throw Error('草稿快照 Hash 不一致。');const state=JSON.parse(bytes);stateCheck(state);
  const seen=new Set();for(const asset of manifest.assets){if(typeof asset.key!=='string'||!asset.key.startsWith('asset:')||asset.key.length>1024||seen.has(asset.key)||!filename.test(asset.file||'')||!/^[a-f\d]{64}$/.test(asset.sha256||'')||!asset.file.startsWith(asset.sha256+'.')||!Number.isInteger(asset.bytes)||asset.bytes<1||asset.bytes>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(asset.mime))throw Error('草稿图片清单不安全。');seen.add(asset.key);}
  this.cached={manifest,state};return this.cached;
 }
 async asset(key){const metadata=await this.metadata(),asset=metadata?.manifest.assets.find(asset=>asset.key===key);if(!asset)throw Error('草稿图片不存在。');await safeDirectory(path.join(this.directory,'assets'));const file=path.join(this.directory,'assets',asset.file);if((await lstat(file)).isSymbolicLink())throw Error('草稿图片不能是链接。');const bytes=await readFile(file);if(bytes.length!==asset.bytes||digest(bytes)!==asset.sha256||imageMime(bytes)!==asset.mime)throw Error('草稿图片 Hash 或格式不一致。');return {key,mime:asset.mime,data:bytes.toString('base64'),sha256:asset.sha256};}
 async consume(id){const metadata=await this.metadata();if(!metadata||metadata.manifest.id!==id)throw Error('草稿恢复身份不匹配。');await writeFile(path.join(this.root,'Settings','portable-import.json'),JSON.stringify({id,importedAt:new Date().toISOString()}));
  const allowed=new Set(['snapshot.json','manifest.json','assets']);for(const name of await readdir(this.directory))if(!allowed.has(name))return {consumed:true,removed:false};
  const assetNames=new Set(metadata.manifest.assets.map(asset=>asset.file));for(const name of await readdir(path.join(this.directory,'assets')))if(!assetNames.has(name))return {consumed:true,removed:false};
  if(contained(this.root,this.directory)&&path.basename(this.directory)==='PortableDrafts')await rm(this.directory,{recursive:true,force:true});this.cached=null;return {consumed:true,removed:true};
 }
}
