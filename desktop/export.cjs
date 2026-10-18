const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
function exportName(value){let name=String(value||'Skill-Canvas').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,100);if(!name||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name))name='Skill-Canvas-'+name;return name;}
async function exportOriginals({directory,projects,readOutput,onProgress=()=>{}}){
 const parent=await fs.realpath(directory),target=path.join(parent,'Skill-Canvas-Export-'+new Date().toISOString().slice(0,10)+'-'+randomUUID());await fs.mkdir(target);const failures=[];let files=0,completed=0;
 for(const project of projects){try{
  const task=[...(project.tasks||[])].filter(task=>task.stage==='completed'&&task.result?.outputs?.length).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];if(!task)throw Error('没有已完成的原始图片可供导出。');
  const title=exportName(project.management?.title||project.id);for(const [index,output] of task.result.outputs.entries()){
   const bytes=await readOutput(task.taskId,output.id);if(!Buffer.isBuffer(bytes)||createHash('sha256').update(bytes).digest('hex')!==output.sha256)throw Error('原始 PNG 完整性校验失败。');
   const name=`${title}-${project.id}-V${task.result.version||1}-${index+1}.png`;await fs.writeFile(path.join(target,name),bytes,{flag:'wx'});files++;
  }
 }catch(error){failures.push({id:project.id,message:error.message});}onProgress({completed:++completed,total:projects.length});}
 const result={path:target,files,projects:projects.length,failures};await fs.writeFile(path.join(target,'export-report.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
}
module.exports={exportName,exportOriginals};
