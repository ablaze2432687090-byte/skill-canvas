import path from 'node:path';
import {readdir,lstat,readFile,rm} from 'node:fs/promises';
import {contained} from './data.mjs';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
// Only app-shaped backups with an exact manifest inventory are eligible for retention.
export async function pruneBackups(parent,keep){
 if(![1,3,7,14].includes(keep))throw Error('备份保留数量无效。');
 if((await lstat(parent)).isSymbolicLink())throw Error('备份位置不能是链接。');
 const candidates=[];
 for(const entry of await readdir(parent,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.isSymbolicLink()||!/^Skill-Canvas-Backup-\d{4}-[\w-]+-[a-f\d]{8}$/.test(entry.name))continue;
  const root=path.join(parent,entry.name);let manifest;
  try{const file=path.join(root,'backup-manifest.json');if((await lstat(file)).isSymbolicLink())continue;manifest=JSON.parse(await readFile(file,'utf8'));}catch{continue;}
  if(manifest.schema!==2||manifest.automatic!==true||manifest.scope!=='formal-projects-skills-tasks-settings'||!Array.isArray(manifest.files)||manifest.files.length>200000||!Number.isFinite(Date.parse(manifest.createdAt)))continue;
  const expected=new Set(['backup-manifest.json',...manifest.files.map(file=>file.path)]);let safe=true;
  async function scan(directory){for(const name of await readdir(directory)){const file=path.join(directory,name),info=await lstat(file);if(info.isSymbolicLink()){safe=false;return;}if(info.isDirectory())await scan(file);else if(!info.isFile()||!expected.delete(path.relative(root,file).replaceAll('\\','/')))safe=false;}}
  await scan(root);
  if(safe&&!expected.size)for(const entry of manifest.files){
   if(typeof entry.path!=='string'||entry.path.split('/').some(part=>!part||part==='.'||part==='..'||/[\\:]/.test(part))||!/^[a-f\d]{64}$/.test(entry.sha256||'')){safe=false;break;}
   const file=path.join(root,entry.path);if(!contained(root,file)||(await lstat(file)).size!==entry.bytes){safe=false;break;}
   const digest=createHash('sha256');for await(const bytes of createReadStream(file))digest.update(bytes);if(digest.digest('hex')!==entry.sha256){safe=false;break;}
  }
  if(safe&&!expected.size)candidates.push({root,at:Date.parse(manifest.createdAt)});
 }
 candidates.sort((a,b)=>b.at-a.at);const removed=[];
 for(const candidate of candidates.slice(keep)){if(!contained(parent,candidate.root))throw Error('备份清理路径越界。');await rm(candidate.root,{recursive:true,force:false});removed.push(path.basename(candidate.root));}
 return removed;
}
