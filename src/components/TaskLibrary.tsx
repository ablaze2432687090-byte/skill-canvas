import {confirmAction} from '../components/AppDialogs';
import {useState} from 'react';
import {useCanvas} from '../application/CanvasProvider';
import {Link,navigate} from '../application/router';
import {t,ui} from '../application/i18n';
import {stageLabels} from '../../bridge/protocol/task';
import {captureChange} from '../application/captureChange';
import {Button} from './primitives';

export function TaskLibrary(){
 const {generations,projects,personal,savePersonal,cancelTask,enqueueTask,retryTask,openProject}=useCanvas(),[filter,setFilter]=useState('active'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(error){setError(error instanceof Error?error.message:'操作失败');}finally{setBusy(false);}};
 const all=[...generations].sort((a,b)=>b.startedAt-a.startedAt),active=all.filter(task=>['queued','running'].includes(task.status)),visible=all.filter(task=>filter==='all'||filter==='active'?filter==='all'||['queued','running'].includes(task.status):task.status===filter).slice(0,100);
 return <details className="task-library"><summary>{ui`任务列表 · ${active.length} 项进行中`}</summary>
  <div className="settings-actions"><label>{t('任务筛选')}<select value={filter} aria-label={t('任务筛选')} onChange={event=>setFilter(event.target.value)}>{['active','all','completed','failed','cancelled'].map((value,index)=><option key={value} value={value}>{t(['进行中','全部','已完成','失败','已取消'][index])}</option>)}</select></label>
   <label>{t('并发上限')}<select aria-label={t('并发上限')} value={personal.workflow?.maxConcurrency||2} disabled={busy} onChange={captureChange(event=>run(()=>savePersonal(p=>({...p,workflow:{maxConcurrency:Number(event.target.value)}}))))}>{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>
  </div>
  <p className="settings-hint">{t('排队任务开始前不创建 Turn；关闭应用后不会自动重复提交。提高并发可能同时使用更多额度。')}</p>
  {!visible.length&&<p className="muted">{t('暂无匹配任务')}</p>}
  <ol>{visible.map(task=>{const project=projects.find(project=>project.id===task.projectId),paused=task.codex?.stage==='queued'&&task.codex.queuePaused;return <li key={task.id}>
   <Link href={task.status==='completed'&&task.versions.length?`/result/${task.id}`:`/task/${task.id}`} onClick={()=>{if(task.projectId)openProject(task.projectId);}}>{project?.title||task.codex?.compiledTask?.showcase?.label||task.skillName||task.id}</Link>
   <span>{task.codex?t(stageLabels[task.codex.stage]):t(task.status)}</span>
   <div className="settings-actions">
    {paused&&<Button disabled={busy} onClick={async()=>{if(await confirmAction(t('继续排队后将发送到 Codex，可能消耗额度。继续？')))void run(()=>enqueueTask(task.id));}}>{t('继续排队')}</Button>}
    {['queued','running'].includes(task.status)&&<Button disabled={busy} onClick={()=>void run(()=>cancelTask(task.id))}>{t('取消')}</Button>}
    {task.codex&&['failed','cancelled'].includes(task.status)&&<Button disabled={busy} onClick={async()=>{if(await confirmAction(t('重试会先核对已有结果，必要时新建 Turn 并消耗额度；原失败记录保留。继续？')))void run(async()=>navigate(`/task/${await retryTask(task.id)}`));}}>{t('重试')}</Button>}
   </div>
  </li>;})}</ol>{error&&<p className="field-error" role="alert">{t(error)}</p>}
 </details>;
}
