import path from 'node:path';
import {lstat,readdir,rm,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {within,uuid} from './workspace.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function storageUsage(root){
 const usage={projects:0,skills:0,tasks:0,cache:0,settings:0,other:0,files:0,linksSkipped:0};
 async function walk(folder,kind){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isSymbolicLink()){usage.linksSkipped++;continue;}if(entry.isDirectory())await walk(file,kind);else if(entry.isFile()){usage[kind]+=(await lstat(file)).size;usage.files++;}}}
 for(const [directory,kind] of [['Projects','projects'],['Skills','skills'],['Tasks','tasks'],['Cache','cache'],['Settings','settings'],['Logs','other']])await walk(path.join(root,directory),kind).catch(error=>{if(error.code!=='ENOENT')throw error;});return usage;
}
export async function cleanTemporary(manager,root){
 if([...manager.tasks.values()].some(t=>['queued','preparing','compiling','connecting','submitted','running'].includes(t.stage)))throw Error('请先完成或取消所有任务，再清理缓存。');
 const removed=[],failures=[];
 for(const task of manager.tasks.values()){
  if(task.stage!=='completed'||!uuid.test(task.taskId)||!task.result?.outputs?.length)continue;
  try{
   const project=await manager.projects.read(task.projectId),version=project.versions.find(v=>v.taskId===task.taskId);if(!version)continue;
   for(const output of task.result.outputs){const formal=version.outputs.find(o=>o.id===output.id);if(!formal||!within(path.join(root,'Projects',task.projectId),formal.path))throw Error('正式原图未独立保存。');const bytes=await readFile(await manager.projects.file(task.projectId,path.relative(path.join(root,'Projects',task.projectId),formal.path)));if(hash(bytes)!==formal.sha256)throw Error('正式原图校验失败。');}
   // Task metadata and references remain for retry/audit. Only byte-identical temporary output copies are removed.
   const temporary=path.join(root,'Tasks',task.taskId),outputRoot=path.join(temporary,'output');
   if((await lstat(temporary)).isSymbolicLink()||(await lstat(outputRoot)).isSymbolicLink())throw Error('临时输出路径含链接。');
   const expected=new Set(version.outputs.map(output=>output.sha256));
   async function clean(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(!within(outputRoot,file)||entry.isSymbolicLink())throw Error('临时输出路径含链接。');if(entry.isDirectory())await clean(file);else if(entry.isFile()&&/\.png$/i.test(entry.name)&&(await lstat(file)).size<=32*1024*1024){if(expected.has(hash(await readFile(file)))){await rm(file,{force:false});removed.push(task.taskId+':'+path.relative(outputRoot,file));}}}}
   await clean(outputRoot);
  }catch(error){if(error.code!=='ENOENT')failures.push({id:task.taskId,message:error.message});}
 }
 return {removed:removed.length,failures};
}
