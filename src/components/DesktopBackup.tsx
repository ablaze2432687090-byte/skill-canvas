import { t, ui } from '../application/i18n';
import {useState} from 'react';
import {Button} from './primitives';
import {useCanvas} from '../application/CanvasProvider';
export function DesktopBackup(){
 const desktop=window.skillCanvasDesktop;
 const {prepareDraftBackup}=useCanvas();
 const [includeDrafts,setIncludeDrafts]=useState(true);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 if(!desktop)return null;
 const run=async(restore=false)=>{setBusy(true);setMessage('');setError('');let token:string|undefined;try{
  token=restore||includeDrafts?await prepareDraftBackup((done,total)=>setMessage(ui`草稿图片 ${done} / ${total}`)):undefined;
  const value=restore?await desktop.restoreData(token):await desktop.backupData(token);
  if(value)setMessage(restore?ui`已恢复 ${value.files} 个文件：${value.path}`:ui`已校验 ${value.files} 个文件：${value.path}`);
 }catch(e){setError(e instanceof Error?e.message:'操作未完成，原始备份未修改。');}finally{if(token)await desktop.cancelDraftBackup(token).catch(()=>{});setBusy(false);}};
 return <section className="settings-section"><div className="section-heading"><div><h2>{t("数据备份与恢复")}</h2><p>{t("备份正式项目、原图、参考图、Skill、任务与设置；逐文件校验后保存。")}</p></div><div className="settings-actions"><Button disabled={busy} onClick={()=>void run()}>{busy?t("正在处理…"):t("备份本地数据")}</Button><Button disabled={busy} onClick={()=>void run(true)}>{t("恢复备份")}</Button></div></div><label className="settings-hint settings-check"><input type="checkbox" checked={includeDrafts} disabled={busy} onChange={e=>setIncludeDrafts(e.target.checked)}/>{t("包含未提交草稿与本地参考图")}</label><p className="settings-hint">{t("恢复支持 1.2.0 起创建的备份，当前正式数据会保留为恢复前副本。当前草稿会保存在恢复前副本中；备份不含 Codex 登录凭证，跨电脑需重新登录和验证图片能力。")}</p><p className="settings-hint">{t("备份含私人作品，请勿上传到公开仓库。")}</p>{t(message)&&<p className="settings-hint local-path" role="status">{t(message)}</p>}{t(error)&&<p className="field-error" role="alert">{t(error)}</p>}</section>;
}
