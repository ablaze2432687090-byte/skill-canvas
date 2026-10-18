import {confirmDeletion} from '../application/deleteImpact';
import { t, ui } from '../application/i18n';
import { Copy, FolderOpen, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { CanvasProject } from '../domain/types';
import { projectPresentation } from '../application/presentation';
import { navigate } from '../application/router';
import { useCanvas } from '../application/CanvasProvider';
import { Button, Thumbnail } from './primitives';
import {ModalFrame} from './ModalFrame';

export function ProjectCard({ project,selectionMode=false,selected=false,onToggle }: { project: CanvasProject;selectionMode?:boolean;selected?:boolean;onToggle?:()=>void }) {
  const {settings,manageSkill, openProject, deleteProject,copyProject,updateProjectMetadata,uploadPersonalMedia,projectGroups } = useCanvas();
  const [error, setError] = useState('');
  const [editing,setEditing]=useState(false),[title,setTitle]=useState(project.title),[group,setGroup]=useState(project.groupId||''),[tags,setTags]=useState((project.tags||[]).join(', ')),[busy,setBusy]=useState(false);

  const view = projectPresentation(project);
  const open = () => {if(selectionMode){onToggle?.();return;} openProject(project.id); navigate(view.route); };
  return <article className={`project-card ${selected?'project-selected':''}`} data-project-id={project.id}>
    {selectionMode&&<input className="project-select" type="checkbox" aria-label={ui`选择项目：${view.title}`} checked={selected} onChange={onToggle}/>}
    <button className="image-card full-width project-artwork" onClick={open} aria-label={ui`打开项目：${view.title}`}>
      <Thumbnail image={view.image} alt={`${view.title} · ${view.resultVersion || '作品'}`} empty={t(view.status) || t("尚未生成")}>{['draft', 'ready'].includes(project.status) && <small>{t("尚未生成")}</small>}</Thumbnail>
      {view.image && t(view.status) && <span className="project-state">{t(view.status)}</span>}
    </button>
    <div className="project-caption"><h3><button onClick={open} title={view.title}>{view.title}</button></h3>
      <details className="project-menu"><summary aria-label={ui`作品操作：${view.title}`}><MoreHorizontal size={19} /></summary><div className="project-menu-panel">
        <Button variant="text" onClick={()=>{setTitle(project.title);setGroup(project.groupId||'');setTags((project.tags||[]).join(', '));setEditing(true);}}><Pencil size={16}/>{t("名称、分组与标签")}</Button>
        <label className="directory-import">{t('设置项目封面')}<input type="file" accept="image/png" aria-label={t('设置项目封面')} disabled={busy} onChange={async event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;setBusy(true);try{const image=await uploadPersonalMedia(file);await updateProjectMetadata(project.id,{customCover:image.id});}catch(error){setError(error instanceof Error?error.message:'保存失败');}finally{setBusy(false);}}}/></label>{project.customCover&&<Button variant="text" onClick={()=>void updateProjectMetadata(project.id,{customCover:null}).catch(error=>setError(error.message))}>{t('恢复作品封面')}</Button>}<Button variant="text" disabled={busy} onClick={async()=>{setBusy(true);try{await copyProject(project.id);}catch(f){setError(f instanceof Error?f.message:'复制失败');}finally{setBusy(false);}}}><Copy size={16}/>{t("复制为新草稿")}</Button>
        {window.skillCanvasDesktop && <Button variant="text" onClick={() => { void window.skillCanvasDesktop!.reveal('project', project.id).catch(failure => setError(failure.message)); }}><FolderOpen size={16} />{t("在文件夹中显示")}</Button>}
        <Button variant="text" className="danger-action" aria-label={ui`删除项目：${view.title}`} onClick={async () => {
          try {if(!await confirmDeletion([project.id],manageSkill,settings.codexMode==='real'))return;await deleteProject(project.id); } catch (failure) { setError(failure instanceof Error ? failure.message : '删除失败'); }
        }}><Trash2 size={16} />{t("彻底删除")}</Button>
      </div></details>
    </div>
    <p className="project-skill">{view.skillName}{view.skillVersion ? ` · ${view.skillVersion}` : ''}{view.resultVersion ? ` · ${view.resultVersion}` : ''}</p>
    <time className="project-time" dateTime={project.updatedAt}>{view.time}</time>
    {(project.groupId||project.tags?.length)?<div className="project-labels">{projectGroups.find(g=>g.id===project.groupId)&&<span>{projectGroups.find(g=>g.id===project.groupId)!.name}</span>}{project.tags?.slice(0,3).map(tag=><span key={tag}>#{tag}</span>)}</div>:null}
    {t(error) && <p className="field-error" role="alert">{t(error)}</p>}
    {editing&&<ModalFrame label={t('编辑项目')} className="project-dialog" onClose={()=>{if(!busy)setEditing(false);}}><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await updateProjectMetadata(project.id,{title,groupId:group||null,tags:tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean)});setEditing(false);setError('');}catch(f){setError(f instanceof Error?f.message:'保存失败');}finally{setBusy(false);}}}>
      <div className="section-heading"><h2>{t("编辑项目")}</h2><button type="button" aria-label={t("关闭编辑")} onClick={()=>setEditing(false)}><X size={20}/></button></div>
      <label>{t("项目名称")}<input autoFocus aria-label={t("项目名称")} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} required/></label>
      <label>{t("所属分组")}<select aria-label={t("所属分组")} value={group} onChange={e=>setGroup(e.target.value)}><option value="">{t("未分组")}</option>{projectGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label>{t("标签")}<input aria-label={t("项目标签")} value={tags} onChange={e=>setTags(e.target.value)} placeholder={t("用逗号分隔，例如：品牌、旅行")}/></label>
      {t(error)&&<p className="field-error" role="alert">{t(error)}</p>}<Button type="submit" disabled={busy}>{t("保存")}</Button>
    </form></ModalFrame>}
  </article>;
}
