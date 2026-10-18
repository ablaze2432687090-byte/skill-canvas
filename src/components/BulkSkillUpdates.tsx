import {confirmAction} from './AppDialogs';
import {useState} from 'react';
import {useCanvas} from '../application/CanvasProvider';
import type {SkillManifest} from '../domain/skill';
import {t,ui} from '../application/i18n';
import {Button} from './primitives';
export function BulkSkillUpdates(){
 const {manifests,manageSkill}=useCanvas(),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[failures,setFailures]=useState<string[]>([]),[selected,setSelected]=useState<string[]>([]);
 const available=manifests.filter(m=>m.installation.rootId==='managed'&&m.installation.installed&&m.source.repository&&!m.installation.locked),updates=available.filter(m=>m.version.updateStatus==='available');
 const run=async(install=false)=>{const items=install?updates.filter(m=>selected.includes(m.id)):available;if(install&&!await confirmAction(t('安装所选更新？原版本与项目固定版本保留；个人名称、分类和图片不会被覆盖。')))return;
 setBusy(true);setFailures([]);const errors:string[]=[],failed:string[]=[];
 try{for(const [index,item] of items.entries()){setProgress(`${index+1} / ${items.length}`);try{await manageSkill(install?'update':'check',{id:item.id});}catch(e){errors.push(item.name+': '+(e instanceof Error?e.message:'更新失败'));failed.push(item.id);}}setFailures(errors);if(install)setSelected(failed);}finally{setBusy(false);}};
 return <details className="settings-section"><summary>{t('批量更新')}</summary><p className="settings-hint">{t('仅检查有仓库来源且未锁定的 Skill；检查不会自动安装，更新前可逐项查看文件变化。')}</p><Button disabled={busy||!available.length} onClick={()=>void run()}>{t('检查全部更新')}</Button>{progress&&<span role="status"> {progress}</span>}
 {updates.map(item=><label className="setting-row" key={item.id}><span><input type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={e=>setSelected(e.target.checked?[...selected,item.id]:selected.filter(id=>id!==item.id))}/>{item.name}</span><span>{item.version.installed} → {item.version.latest}</span></label>)}
 <Button disabled={busy||!selected.length} onClick={()=>void run(true)}>{t('安装所选更新')}</Button>{failures.map(error=><p key={error} className="field-error">{t(error)}</p>)}</details>;
}
export function SkillChangeInfo({manifest}:{manifest:SkillManifest}){
 const {manageSkill}=useCanvas(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <><Button disabled={busy} onClick={async()=>{setBusy(true);try{const result=await manageSkill('changes',{id:manifest.id}) as {added:string[];removed:string[];changed:string[];from:string;to:string;licenseStatus:string};setMessage(ui`新增 ${result.added.length} · 修改 ${result.changed.length} · 删除 ${result.removed.length}`+'\n'+result.from+' → '+result.to+'\n'+result.licenseStatus+'\n'+[...result.added,...result.changed,...result.removed].slice(0,100).join('\n'));}catch(e){setMessage(e instanceof Error?e.message:'检查失败');}finally{setBusy(false);}}}>{t('查看更新文件变化')}</Button>{message&&<pre className="diagnostic-report">{t(message)}</pre>}</>;
}
