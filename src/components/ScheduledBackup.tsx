import {useEffect,useRef,useState} from 'react';
import {t,getLanguage} from '../application/i18n';
import {useCanvas} from '../application/CanvasProvider';
import {Button} from './primitives';
export function BackupHeartbeat(){
 const {ready,prepareDraftBackup}=useCanvas(),busy=useRef(false),prepare=useRef(prepareDraftBackup);prepare.current=prepareDraftBackup;
 useEffect(()=>{if(!ready||!window.skillCanvasDesktop?.backupSchedule)return;const desktop=window.skillCanvasDesktop;
  const check=async()=>{if(busy.current)return;busy.current=true;let token:string|undefined;
   try{const plan=await desktop.backupSchedule();if(!plan.enabled||Date.now()-Date.parse(plan.lastSuccess||'1970-01-01')<plan.hours*3600000)return;
    if(plan.includeDrafts)token=await prepare.current();await desktop.runScheduledBackup(token);
   }catch{await desktop.reportBackupFailure().catch(()=>{});}finally{if(token)await desktop.cancelDraftBackup(token).catch(()=>{});busy.current=false;}};
  const timer=setInterval(()=>void check(),300000),initial=setTimeout(()=>void check(),60000);return()=>{clearInterval(timer);clearTimeout(initial);};
 },[ready]);return null;
}
export function ScheduledBackupSettings(){
 const [plan,setPlan]=useState<BackupSchedule>({enabled:false,hours:24,keep:3,includeDrafts:true}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const desktop=window.skillCanvasDesktop;
 useEffect(()=>{void desktop?.backupSchedule?.().then(setPlan).catch(()=>{});},[desktop]);
 if(!desktop?.backupSchedule)return null;
 return <section className="settings-section scheduled-backup-settings"><h2>{t('自动备份')}</h2><p className="settings-hint">{t('仅在应用打开且无生成任务时运行；关闭应用后不会运行。仅清理此目录中可识别的旧备份。')}</p>
 <label className="settings-check"><input type="checkbox" checked={plan.enabled} onChange={e=>setPlan({...plan,enabled:e.target.checked})}/>{t('启用自动备份')}</label>
 <div className="settings-form-grid"><label className="settings-form-field">{t('备份频率')}<select value={plan.hours} onChange={e=>setPlan({...plan,hours:Number(e.target.value) as BackupSchedule['hours']})}>{[24,72,168].map(n=><option key={n} value={n}>{n} h</option>)}</select></label><label className="settings-form-field">{t('保留备份数量')}<select value={plan.keep} onChange={e=>setPlan({...plan,keep:Number(e.target.value) as BackupSchedule['keep']})}>{[1,3,7,14].map(n=><option key={n}>{n}</option>)}</select></label></div>
 <label className="settings-check"><input type="checkbox" checked={plan.includeDrafts} onChange={e=>setPlan({...plan,includeDrafts:e.target.checked})}/>{t('包含未提交草稿与本地参考图')}</label>
 <div className="backup-location-status"><p className="settings-hint local-path">{plan.directory||t('尚未选择备份位置')}</p><p className="settings-hint">{plan.lastSuccess?new Date(plan.lastSuccess).toLocaleString(getLanguage()):t('尚未自动备份')}</p>
 </div><div className="settings-actions backup-schedule-actions"><Button variant="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setPlan(await desktop.saveBackupSchedule(plan));}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}}>{t('保存自动备份设置')}</Button>
 <Button disabled={busy} onClick={async()=>{setBusy(true);try{setPlan(await desktop.saveBackupSchedule({...plan,enabled:true,chooseDirectory:true}));}catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}}>{t('更换备份位置')}</Button>
 </div>{(error||plan.error)&&<p className="field-error" role="alert">{t(error||plan.error||'')}</p>}</section>;
}
