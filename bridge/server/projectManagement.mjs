import path from 'node:path';
import {realpath,lstat,rm,mkdir,writeFile} from 'node:fs/promises';
import {uuid,within,replaceRecord} from './workspace.mjs';
const active=new Set(['queued','preparing','compiling','connecting','submitted','running']);
const missingThread=e=>/not found|does not exist|no rollout found|不存在|找不到/i.test((e.message||'')+' '+(e.detail||''));
export async function deletionImpact(manager,ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>!uuid.test(id)))throw Error('请选择 1–200 个项目。');
 const unique=[...new Set(ids)],all=await manager.projects.all(),chosen=all.filter(p=>unique.includes(p.id));
 const tasks=[...chosen.flatMap(p=>p.tasks||[]),...[...manager.tasks.values()].filter(t=>unique.includes(t.projectId))];
 const otherThreads=new Set(all.filter(p=>!unique.includes(p.id)).flatMap(p=>[p.threadId,...p.tasks.flatMap(t=>[t.threadId,t.executionProvenance?.sourceThreadId])]).filter(Boolean));
 const threads=[...new Set(tasks.map(t=>t.threadId).filter(Boolean))];
 return {projects:unique.length,versions:chosen.reduce((n,p)=>n+(p.versions?.length||0),0),originals:new Set(chosen.flatMap(p=>(p.versions||[]).flatMap(v=>v.outputs||[])).map(o=>o.path)).size,references:new Set(tasks.flatMap(t=>t.payload?.images||[]).map(i=>i.path)).size,exclusiveThreads:threads.filter(t=>!otherThreads.has(t)).length,sharedThreads:threads.filter(t=>otherThreads.has(t)).length,blocked:tasks.some(t=>active.has(t.stage))};
}
async function exactDirectory(root,id){
 if(!uuid.test(id))throw Error('项目或任务 ID 无效。');
 const resolvedRoot=await realpath(root),target=path.join(resolvedRoot,id);
 const info=await lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!info)return null;
 if(info.isSymbolicLink()||!info.isDirectory()||await realpath(target)!==target||!within(resolvedRoot,target)||path.basename(target)!==id)throw Error('拒绝删除越界目录或链接。');return target;
}
export async function purgeProject(manager,id){
 await manager.boot;if(!uuid.test(id))throw Error('项目 ID 无效。');
 manager.deletingProjects||=new Set();if(manager.deletingProjects.has(id)||manager.creating.has(id))throw Error('项目正在操作，请稍后再试。');manager.deletingProjects.add(id);
 try{
  await manager.projects.queues?.get(id);
  const all=await manager.projects.all(),project=all.find(p=>p.id===id);
  const tasks=[...(project?.tasks||[]),...[...manager.tasks.values()].filter(t=>t.projectId===id)];
  if(tasks.some(t=>active.has(t.stage)))throw Error('请先取消正在执行的任务，再彻底删除。');
  const others=all.filter(p=>p.id!==id),sharedThreads=new Set(others.flatMap(p=>[p.threadId,...p.tasks.flatMap(t=>[t.threadId,t.executionProvenance?.sourceThreadId])]).filter(Boolean));
  const threads=[...new Set(tasks.map(t=>t.threadId).filter(Boolean))];
  const exclusive=threads.filter(t=>!sharedThreads.has(t));
  const absentThreads=new Set();let deletedThreads=0;
  const targets=[],projectDir=await exactDirectory(manager.projects.root,id);if(projectDir)targets.push(projectDir);
  const taskIds=[...new Set(tasks.map(t=>t.taskId))];
  for(const taskId of taskIds){const own=manager.tasks.get(taskId)||tasks.find(t=>t.taskId===taskId);if(own.projectId!==id)throw Error('任务不属于目标项目。');const target=await exactDirectory(manager.workspaces.root,taskId);if(target)targets.push(target);}
  // Native caches may be shared by different projects/derivatives. Never erase a shared thread.
  for(const thread of exclusive){const target=await exactDirectory(manager.imageCacheRoot,thread).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(target)targets.push(target);}
  for(const p of others)for(const t of p.tasks){const refs=[...t.payload.images.map(i=>i.path),...(t.result?.outputs||[]).map(o=>o.path),t.executionProvenance?.sourcePath].filter(Boolean);if(projectDir&&refs.some(f=>within(projectDir,path.resolve(f))))throw Error('其他项目仍直接引用此项目文件，请先复制引用后删除。');}
  if(exclusive.length){await manager.client.start();for(const threadId of exclusive){
   const history=await manager.client.request('thread/read',{threadId,includeTurns:true}).catch(async e=>{
    const detail=(e.message||'')+' '+(e.detail||'');if(missingThread(e)){absentThreads.add(threadId);return null;}
    if(/thread not loaded/i.test(detail)){try{await manager.client.request('thread/resume',{threadId,approvalPolicy:'never',sandbox:'workspace-write'});return await manager.client.request('thread/read',{threadId,includeTurns:true});}catch(n){if(missingThread(n)){absentThreads.add(threadId);return null;}throw n;}}throw e;
   });
   if(history?.thread?.turns?.some(t=>t.status==='inProgress'))throw Error('Codex 线程仍在执行，请先取消。');
  }
   for(const threadId of exclusive){if(absentThreads.has(threadId))continue;await manager.client.request('thread/delete',{threadId}).catch(async e=>{
     let detail=(e.message||'')+' '+(e.detail||'');if(missingThread(e)){absentThreads.add(threadId);return;}
     if(/thread not loaded/i.test(detail)){try{await manager.client.request('thread/resume',{threadId,approvalPolicy:'never',sandbox:'workspace-write'});await manager.client.request('thread/delete',{threadId});return;}catch(n){if(missingThread(n)){absentThreads.add(threadId);return;}throw n;}}
     throw e;
   });if(!absentThreads.has(threadId))deletedThreads++;}
  }
  // Keep ownership metadata until every other target is gone, so a transient failure is retryable.
  const ordered=[...targets.filter(t=>t!==projectDir),...(projectDir?[projectDir]:[])];
  for(const target of ordered){const parent=path.dirname(target),resolved=await realpath(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!resolved)continue;if(resolved!==target||!within(await realpath(parent),resolved))throw Error('删除前路径校验失败。');await rm(target,{recursive:true,force:false,maxRetries:3,retryDelay:150});}
  for(const taskId of taskIds)manager.tasks.delete(taskId);
  manager.deletedProjects||=new Set();manager.deletedProjects.add(id);
  return {deleted:true,projectId:id,taskCount:taskIds.length,threadCount:deletedThreads,threadsAlreadyMissing:[...absentThreads],sharedThreadsPreserved:threads.filter(t=>sharedThreads.has(t)),directories:targets};
 }finally{manager.deletingProjects.delete(id);}
}
export function projectMetadata(input){
 const value={};if(input.customCover!==undefined){if(input.customCover!==null&&(typeof input.customCover!=='string'||!/^[a-f0-9]{64}$/.test(input.customCover)))throw Error('项目封面身份无效。');value.customCover=input.customCover;}
 if(input.title!==undefined){if(typeof input.title!=='string'||!input.title.trim()||input.title.length>120)throw Error('项目名称须为 1–120 字。');value.title=input.title.trim();}
 if(input.groupId!==undefined){if(input.groupId!==null&&(typeof input.groupId!=='string'||!uuid.test(input.groupId)))throw Error('分组 ID 无效。');value.groupId=input.groupId;}
 if(input.tags!==undefined){if(!Array.isArray(input.tags)||input.tags.length>16||input.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>24))throw Error('最多 16 个标签，每个不超过 24 字。');value.tags=[...new Set(input.tags.map(t=>t.trim()))];}return value;
}
