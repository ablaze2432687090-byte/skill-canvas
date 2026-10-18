import {confirmAction} from './AppDialogs';
import {useState} from 'react';
import {useCanvas} from '../application/CanvasProvider';
import {t,ui} from '../application/i18n';
import {Button} from './primitives';
export function StorageMaintenance(){
 const {manageSkill}=useCanvas(),[usage,setUsage]=useState<Record<string,number>>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const run=async(clean=false)=>{setBusy(true);setMessage('');try{if(clean){if(!await confirmAction(t('仅清理已校验正式原图的成功任务临时输出；不删除原图、参考图、Skill 版本或外部 Codex 缓存。继续？')))return;const result=await manageSkill('storage-clean',{confirm:true}) as {removed:number;failures:{message:string}[]};setMessage(ui`已清理 ${result.removed} 个临时文件`);if(result.failures.length)setMessage(result.failures.map(item=>item.message).join('; '));}setUsage(await manageSkill('storage-usage',{}) as Record<string,number>);}catch(e){setMessage(e instanceof Error?e.message:'操作失败');}finally{setBusy(false);}};
 return <section className="settings-section"><h2>{t('存储与安全清理')}</h2><p className="settings-hint">{t('只检查当前数据目录；不会清理系统文件或外部 Codex 图片。')}</p><div className="settings-actions"><Button disabled={busy} onClick={()=>void run()}>{t('检查空间占用')}</Button><Button disabled={busy} onClick={()=>void run(true)}>{t('清理安全临时文件')}</Button></div>{usage&&<dl className="skill-source-metadata">{[['projects','项目与原图'],['skills','Skill 与历史版本'],['tasks','任务临时文件'],['cache','缓存'],['settings','设置与个人图片']].map(([key,label])=><div key={key}><dt>{t(label)}</dt><dd>{((usage[key]||0)/1048576).toFixed(1)} MB</dd></div>)}</dl>}{message&&<p role="status" className="settings-hint">{t(message)}</p>}</section>;
}
