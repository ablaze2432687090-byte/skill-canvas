import {confirmAction} from '../components/AppDialogs';
import {useState} from 'react';
import {useCanvas} from '../application/CanvasProvider';
import {inspectPreset,insertTemplate} from '../application/reuse';
import {t} from '../application/i18n';
import type {SkillManifest} from '../domain/skill';
import {Button} from './primitives';

export function CreationReuse({manifest}:{manifest:SkillManifest}){
 const {personal,savePersonal,draft,updateDraft}=useCanvas(),[presetId,setPresetId]=useState(''),[templateId,setTemplateId]=useState(''),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const preset=personal.presets.find(p=>p.id===presetId&&p.skillId===manifest.installation.id),inspection=preset?inspectPreset(preset,manifest):null,template=personal.templates.find(p=>p.id===templateId);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(error){setError(error instanceof Error?error.message:'保存失败');}finally{setBusy(false);}};
 const savePreset=async(parameters=draft.parameters||{},label=name.trim())=>{
  if(!label)throw Error('请填写预设名称。');
  await savePersonal(p=>({...p,presets:[...p.presets,{id:crypto.randomUUID(),name:label,skillId:manifest.installation.id,fingerprint:manifest.version.bundle||manifest.source.fingerprint,parameters}]}));
 };
 const applyPreset=async()=>{
  if(!preset||!inspection?.compatible)throw Error('预设参数已变化，请先适配并另存。');
  if(inspection.stale&&!await confirmAction(t('Skill 版本已变化，确认使用这些仍兼容的参数？不会修改原预设。')))return;
  updateDraft({parameters:{...draft.parameters,...preset.parameters}});
 };
 const copyPreset=async()=>{if(preset)await savePersonal(p=>({...p,presets:[...p.presets,{...preset,id:crypto.randomUUID(),name:name.trim()||preset.name+' Copy'}]}));};
 const deletePreset=async()=>{if(preset)await savePersonal(p=>({...p,presets:p.presets.filter(item=>item.id!==preset.id)}));};
 const adaptPreset=async()=>{if(inspection)await savePreset(inspection.suggested,name.trim()||(preset?.name||'Preset')+' Adapted');};
 const saveTemplate=()=>savePersonal(p=>({...p,templates:[...p.templates,{id:crypto.randomUUID(),name:name.trim(),prompt:draft.prompt,requirements:draft.requirements}]}));
 const copyTemplate=async()=>{if(template)await savePersonal(p=>({...p,templates:[...p.templates,{...template,id:crypto.randomUUID(),name:name.trim()||template.name+' Copy'}]}));};
 const deleteTemplate=async()=>{if(template)await savePersonal(p=>({...p,templates:p.templates.filter(item=>item.id!==template.id)}));};
 const applyTemplate=async()=>{if(template)updateDraft(insertTemplate(draft,template));};
 return <details className="workspace-reuse">
  <summary>{t('常用预设与文本')}</summary>
  <label>{t('名称')}<input aria-label={t('预设或模板名称')} maxLength={60} value={name} onChange={event=>setName(event.target.value)}/></label>
  <h3>{t('参数预设')}</h3>
  <select aria-label={t('参数预设')} value={presetId} onChange={event=>setPresetId(event.target.value)}>
   <option value="">{t('选择预设')}</option>{personal.presets.filter(p=>p.skillId===manifest.installation.id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
  <div className="settings-actions">
   <Button disabled={busy||!name.trim()} onClick={()=>void run(()=>savePreset())}>{t('保存当前参数')}</Button>
   <Button disabled={busy||!preset} onClick={()=>void run(applyPreset)}>{t('应用预设')}</Button>
   {preset&&<><Button disabled={busy} onClick={()=>void run(copyPreset)}>{t('复制预设')}</Button><Button disabled={busy} onClick={()=>void run(deletePreset)}>{t('删除预设')}</Button></>}
  </div>
  {inspection&&(inspection.stale||!inspection.compatible)&&<div className="settings-hint">
   <p>{t('此预设来自其他 Skill 版本；请核对参数变化。')}</p>
   {inspection.changes.length>0&&<ul>{inspection.changes.map(change=><li key={change}>{change}</li>)}</ul>}
   <Button disabled={busy} onClick={()=>void run(adaptPreset)}>{t('按当前参数适配另存')}</Button>
  </div>}
  <h3>{t('提示词模板')}</h3>
  <select aria-label={t('提示词模板')} value={templateId} onChange={event=>setTemplateId(event.target.value)}>
   <option value="">{t('选择模板')}</option>{personal.templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}
  </select>
  <div className="settings-actions">
   <Button disabled={busy||!name.trim()||!draft.prompt.trim()&&!draft.requirements.trim()} onClick={()=>void run(saveTemplate)}>{t('保存当前文本')}</Button>
   <Button disabled={busy||!template} onClick={()=>void run(applyTemplate)}>{t('插入模板')}</Button>
   {template&&<><Button disabled={busy} onClick={()=>void run(copyTemplate)}>{t('复制模板')}</Button><Button disabled={busy} onClick={()=>void run(deleteTemplate)}>{t('删除模板')}</Button></>}
  </div>
  <p className="settings-hint">{t('模板追加到现有内容，不会自动覆盖。预设仅属于当前 Skill。')}</p>
  {error&&<p className="field-error" role="alert">{t(error)}</p>}
 </details>;
}
