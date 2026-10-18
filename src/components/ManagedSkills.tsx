import {confirmAction} from '../components/AppDialogs';
import {BulkSkillUpdates,SkillChangeInfo} from './BulkSkillUpdates';
import {categoryName,recommendedPersonalCategory} from '../application/customization';
import { zipSkillInput } from '../application/skillImport';
import { getLanguage } from '../application/i18n';
import { t, ui } from '../application/i18n';
import { useState } from 'react';
import { FolderOpen, Plus, RefreshCw } from 'lucide-react';
import { useCanvas } from '../application/CanvasProvider';
import { Link, useLocation } from '../application/router';
import type { SkillManifest, SkillSource } from '../domain/skill';
import { skillPresentation, versionLabel } from '../application/presentation';
import { supportsSingleShowcase } from '../application/showcase';
import { Button, EmptyState, PageHeader, SelectControl, StatusBadge } from './primitives';

export const updateLabels = { unchecked: '尚未检查', current: '已是最新', available: '有可用更新', locked: '版本已锁定', skipped: '已跳过此版本' };
export const sourceLabels = { official: 'OpenAI 官方', github: 'GitHub 原作者', local: '本地文件夹', demo: '演示 Skill' };
export function publicSourceUrl(value?: string | null) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
}

interface InstallPreview { token: string; source: Partial<SkillSource>; version: string; commit: string | null; paths: string[] }
type Manage = (action: string, input: Record<string, unknown>) => Promise<unknown>;

async function localFiles(files: File[]) {
  if (!files.length || files.length > 500) throw new Error('请选择包含 1–500 个文件的 Skill 文件夹。');
  if (files.some(file => file.size > 8 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 64 * 1024 * 1024) throw new Error('文件夹最多 64 MB，单个文件最多 8 MB。');
  const folder = files[0].webkitRelativePath.split('/')[0];
  if (!folder || files.some(file => !file.webkitRelativePath.startsWith(`${folder}/`))) throw new Error('请重新选择一个完整文件夹。');
  const encoded = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
    encoded.push({ path: file.webkitRelativePath.slice(folder.length + 1), data: btoa(binary) });
  }
  return { type: 'local', folder, files: encoded };
}

function InstallPanel({ manage, target, close, completed }: { manage: Manage; target?: SkillManifest; close: () => void; completed: (message: string) => void }) {
  const {personal,updateSkillDisplay}=useCanvas();
  const [categoryId,setCategoryId]=useState('');
  const [type, setType] = useState<'github' | 'local' | 'zip'>(target ? 'local' : 'github');
  const [url, setUrl] = useState(''), [ref, setRef] = useState('');
  const [preview, setPreview] = useState<InstallPreview | null>(null), [skillPath, setSkillPath] = useState<string | null>(null);
  const [review, setReview] = useState<SkillManifest | null>(null);
  const [reviewedPath, setReviewedPath] = useState<string | null>(null);
  const [trusted, setTrusted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [autoShowcase, setAutoShowcase] = useState(true);
  const [translations,setTranslations]=useState({en:{name:'',description:''},'zh-CN':{name:'',description:''}});
  const inspect = async (input: Record<string, unknown>) => {
    setBusy(true); setError(''); setPreview(null); setReview(null); setReviewedPath(null); setSkillPath(null); setTrusted(false);
    try {
      const result = await manage('preview', input) as InstallPreview;
      if (!result.token || !Array.isArray(result.paths) || !result.paths.length) throw new Error('安装摘要不完整，请重新检查。');
      setPreview(result);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取 Skill 来源。'); }
    finally { setBusy(false); }
  };
  const previewLocal = async (files: File[]) => {
    setBusy(true); setError(''); setPreview(null);
    try { await inspect(await localFiles(files)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取文件夹。'); }
    finally { setBusy(false); }
  };
  const source = preview?.source;
  const pickNative = async () => {
    setBusy(true); setError('');
    try { const input = await window.skillCanvasDesktop!.pickSkillDirectory(); if (input) await inspect({ ...input }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '无法读取文件夹。'); }
    finally { setBusy(false); }
  };
  const missingLicense = !!preview && source?.type !== 'local' && source?.licenseStatus !== '明确许可';
  const createExamples = autoShowcase && !!review && supportsSingleShowcase(review);
  return <section className="skill-install-panel" aria-label={target ? t("更新本地 Skill") : t("添加 Skill")}>
    <div className="section-heading"><div><h2>{target ? ui`更新 ${target.name}` : t("添加 Skill")}</h2><p>{target ? t("重新选择来源文件夹。原版本会保留，历史项目不会自动切换。") : t("先检查来源和许可，再安装到本机。不会执行第三方安装脚本。")}</p></div><Button variant="text" disabled={busy} onClick={close}>{t("取消")}</Button></div>
    {!target && <div className="category-tabs" role="group" aria-label={t("安装来源")}>{(['github', 'local', 'zip'] as const).map(value => <button type="button" key={value} disabled={busy} className={type === value ? 'is-selected' : ''} aria-pressed={type === value} onClick={() => { setType(value); setPreview(null); setError(''); }}>{value === 'github' ? t("GitHub 仓库") : value === 'zip' ? t('ZIP 压缩包') : t("本地文件夹")}</button>)}</div>}
    <details className="skill-install-version"><summary>{t('支持的文件结构与安装状态')}</summary><p className="settings-hint">{t('目录或 ZIP 中需要 SKILL.md，包含 name 和 description。可粘贴 GitHub 仓库地址或 tree 子目录地址；分支名含斜线时请使用仓库地址并单独指定版本。')}</p><pre>my-skill/
  SKILL.md
  references/ (optional)</pre><p className="settings-hint">{t('待验证：已安装但尚未真实出图；可用：已有同版本成功记录；需要配置或暂不兼容：查看具体原因。安装不等于已实测。')}</p></details>
    <p className="settings-hint">{t("支持交由 Codex 内置 ImageGen 执行的视觉 Skill；依赖外部 API、脚本或特殊环境的 Skill 可能仅能保存，安装前会列出兼容性和缺失依赖。")}</p>
    {type === 'github' ? <form className="skill-source-form" onSubmit={event => { event.preventDefault(); void inspect({ type: 'github', url: url.trim(), ...(ref.trim() ? { ref: ref.trim() } : {}) }); }}><label htmlFor="skill-repository">{t("原作者仓库地址")}</label><div className="skill-source-entry"><input id="skill-repository" type="url" required placeholder={t("https://github.com/作者/仓库")} value={url} disabled={busy} onChange={event => { setUrl(event.target.value); setPreview(null); }} /><Button type="submit" disabled={busy || !url.trim()}>{busy ? t("正在检查…") : t("检查来源")}</Button></div><details className="skill-install-version"><summary>{t("指定版本（可选）")}</summary><label htmlFor="skill-source-ref">{t("Release、Tag 或 Commit")}</label><input id="skill-source-ref" value={ref} disabled={busy} onChange={event => { setRef(event.target.value); setPreview(null); }} placeholder={t("留空按 Release → Tag → Commit 检测")} /></details></form> : type === 'zip' ? <div className="skill-local-entry"><label className="directory-import">{t('选择 ZIP 文件')}<input type="file" accept=".zip,application/zip" disabled={busy} aria-label={t('选择 ZIP 文件')} onChange={async event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;setBusy(true);setError('');try{await inspect(await zipSkillInput(file));}catch(failure){setError(failure instanceof Error?failure.message:'ZIP 读取失败。');}finally{setBusy(false);}}}/></label><p className="settings-hint">{t('仅检查并复制文件，不执行脚本。支持 ZIP 内的多个 Skill 目录；不支持加密包、链接或 ZIP64。')}</p></div> : <div className="skill-local-entry">{window.skillCanvasDesktop ? <Button disabled={busy} onClick={() => void pickNative()}>{busy ? t("正在读取…") : target ? t("重新选择 Skill 文件夹") : t("选择 Skill 文件夹")}</Button> : <label className="directory-import"><FolderOpen size={16} />{busy ? t("正在读取…") : target ? t("重新选择 Skill 文件夹") : t("选择 Skill 文件夹")}<input type="file" {...{ webkitdirectory: '', directory: '' }} multiple disabled={busy} aria-label={target ? t("重新选择本地 Skill 文件夹") : t("选择本地 Skill 文件夹")} onChange={event => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; if (files.length) void previewLocal(files); }} /></label>}<p className="settings-hint">{t("只读取你选中的文件夹并复制为版本快照；源文件不变。最多 500 个文件、64 MB。")}</p></div>}
    {preview && <div className="skill-install-summary"><dl className="skill-source-metadata"><div><dt>{t("来源")}</dt><dd>{t(sourceLabels[source?.type || (type==='github'?'github':'local')])}{source?.author ? ` · ${source.author}` : ''}</dd></div><div><dt>{t("仓库 / 目录")}</dt><dd>{publicSourceUrl(source?.repository) ? <a href={publicSourceUrl(source?.repository)} target="_blank" rel="noreferrer">{source?.repository}</a> : source?.localPath || t("已选择的本地文件夹")}</dd></div><div><dt>{t("版本")}</dt><dd>{preview.version}</dd></div>{preview.commit && <div><dt>Commit</dt><dd className="local-path">{preview.commit}</dd></div>}<div><dt>{t("许可证")}</dt><dd>{publicSourceUrl(source?.licenseUrl) ? <a href={publicSourceUrl(source?.licenseUrl)} target="_blank" rel="noreferrer">{t(source?.license) || t("查看许可证文件")}</a> : t(source?.license) || t("未检测到明确许可")}</dd></div></dl>
      <SelectControl label={t("Skill 路径")} value={skillPath === null ? '' : String(preview.paths.indexOf(skillPath) + 1)} onChange={value => { if (busy) return; setSkillPath(value ? preview.paths[Number(value) - 1] : null); setReview(null); setReviewedPath(null); }} options={[{ value: '', label: '请选择要安装的 Skill 目录' }, ...preview.paths.map((path, index) => ({ value: String(index + 1), label: path ? `${path}/SKILL.md` : `${type === 'local' ? '文件夹' : '仓库'}根目录 / SKILL.md` }))]} />
      <p className="settings-hint">{t("仅记录来源中的许可信息，不代表对使用或再分发权限的判断。脚本和外部依赖不会自动安装。")}</p>
      {source?.type === 'github' && <label className="skill-trust-confirm"><input type="checkbox" checked={trusted} disabled={busy} onChange={event => setTrusted(event.target.checked)} /><span>{t("我已核对作者与仓库，确认这是原作者来源，不是转载或聚合仓库。")}</span></label>}
      {missingLicense && <p className="field-error">{t("未检测到明确许可证，不提供 GitHub 安装。获得使用许可后，可自行下载并从本地导入。")}</p>}
      {!review || reviewedPath !== skillPath ? <Button disabled={busy || missingLicense || skillPath === null} onClick={async () => {
        setBusy(true); setError('');
        try { setReview(await manage('review', { token: preview.token, path: skillPath }) as SkillManifest); setReviewedPath(skillPath); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Skill 验证未通过。'); }
        finally { setBusy(false); }
      }}>{busy ? t("正在下载并验证…") : t("验证所选 Skill")}</Button> : <div className="skill-review"><h3>{skillPresentation(review).displayName}</h3><p className="settings-hint">{skillPresentation(review).displayDescription}</p><dl className="skill-source-metadata"><div><dt>{t("安装版本")}</dt><dd>{review.version.installed || t("未声明")}</dd></div><div><dt>{t("声明作者")}</dt><dd>{review.source.author || t("未声明")}</dd></div>{review.runtime.dependencies.length > 0 && <div><dt>{t("依赖")}</dt><dd>{review.runtime.dependencies.map(dependency => `${dependency.name} · ${t(t(dependency.status === 'available' ? '已找到' : dependency.status === 'missing' ? '缺失' : '待验证'))}`).join('；')}</dd></div>}</dl><p className="settings-hint">{review.runtime.status === 'ready' ? t("兼容性验证通过 · 可以使用") : review.runtime.status === 'needs_configuration' ? t("需要配置 · 可保存，但暂不能生成") : t("暂不兼容 · 请查看说明")}</p>{review.runtime.issues.length > 0 && <ul className="skill-issues">{review.runtime.issues.map(issue => <li key={t(issue)}>{t(issue)}</li>)}</ul>}
      {!target&&<label>{t('主分类')}<select aria-label={t('安装主分类')} value={categoryId||recommendedPersonalCategory(review,skillPresentation(review).displayCategory[0])} onChange={event=>setCategoryId(event.target.value)}>{personal.categories.map(c=><option key={c.id} value={c.id}>{categoryName(c)}</option>)}</select></label>}
      {!target && <details className="skill-install-version"><summary>{t('展示语言（可选）')}</summary><p className="settings-hint">{t('只保存展示名称与简介，不修改原始 Skill。未填写时使用已有翻译或原文。')}</p>{(['zh-CN','en'] as const).map(language=><div key={language} className="field"><label>{language==='en'?'English':'简体中文'}<input aria-label={language+' name'} maxLength={100} value={translations[language].name} onChange={event=>setTranslations(value=>({...value,[language]:{...value[language],name:event.target.value}}))}/><textarea aria-label={language+' description'} maxLength={1000} value={translations[language].description} onChange={event=>setTranslations(value=>({...value,[language]:{...value[language],description:event.target.value}}))}/></label></div>)}</details>}
      {!target && <label className="skill-trust-confirm"><input type="checkbox" checked={createExamples} disabled={busy || review.runtime.status !== 'ready' || !supportsSingleShowcase(review)} onChange={event => setAutoShowcase(event.target.checked)} /><span>{supportsSingleShowcase(review) ? t("安装后通过 Codex 自动生成 1 张封面和 1 张用途案例（消耗图片额度；无需 API Key）。仅可运行的视觉 Skill 支持。") : t("此 Skill 需成组出图；安装后在工作台生成，成功结果自动关联为案例。")}</span></label>}
      <Button disabled={busy || missingLicense || source?.type === 'github' && !trusted} onClick={async () => {
        setBusy(true); setError('');
        try {
          const result = await manage(target ? 'update' : 'install', { ...(target ? { id: target.id } : { generateShowcase: createExamples, translations }), token: preview.token, path: skillPath, trustAuthor: trusted }) as SkillManifest;
          if(!target)try{await updateSkillDisplay(result.id,{categoryId:categoryId||recommendedPersonalCategory(result,skillPresentation(result).displayCategory[0])});}catch{completed('Skill 已安装，但个人分类保存失败；可在详情页重试。');close();return;}
          completed(result.runtime?.status === 'ready' ? target ? '本地 Skill 已更新；已有项目仍绑定原版本。' : createExamples ? 'Skill 已安装；封面与案例生成状态请在详情页查看。' : 'Skill 已安装，可以从 Skill 库使用。' : 'Skill 已保存，但仍需配置。请查看管理列表中的说明。'); close();
        } catch (failure) { setError(failure instanceof Error ? failure.message : '安装未完成，原版本保持不变。'); }
        finally { setBusy(false); }
      }}>{busy ? t("正在校验并保存…") : target ? t("确认更新") : t("确认安装")}</Button></div>}
    </div>}
    {t(error) && <p className="field-error" role="alert">{t(error)}</p>}
  </section>;
}

export function ManagedSkillsPage() {
  const { manifests, findSkill, scanning, scanRoots, settings, manageSkill } = useCanvas();
  const {query}=useLocation();
  const [tab, setTab] = useState(query.get('tab')==='configuration'?'需要配置':'已安装'), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [installing, setInstalling] = useState(false), [localTarget, setLocalTarget] = useState<SkillManifest>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const installed = manifests.filter(skill => skill.source.type !== 'demo' && (skill.installation.rootId !== 'managed' || skill.installation.installed));
  const filtered = installed.filter(skill => tab === '可更新' ? skill.version.updateStatus === 'available' : tab === '已安装' ? skill.installation.installed && skill.runtime.status === 'ready' : tab === '需要配置' ? skill.runtime.status === 'needs_configuration' : ['invalid', 'unavailable', 'incompatible'].includes(skill.runtime.status));
  const run = async (manifest: SkillManifest, action: string, input: Record<string, unknown> = {}) => {
    setError(''); setMessage(''); setBusyId(manifest.id);
    try {
      const result = await manageSkill(action, { id: manifest.id, ...input }) as SkillManifest;
      const notices: Record<string, string> = { check: updateLabels[result.version?.updateStatus || 'unchecked'], update: '已校验并更新。已有项目保持原版本，新项目使用当前版本。', lock: input.locked ? '版本已锁定，不会安装更新。' : '版本锁定已解除。', skip: '已跳过这次检测到的版本。', rollback: '已恢复上一版本。已有项目仍保留各自的绑定版本。', remove: 'Skill 已移除。历史版本、Prompt 和生成文件仍保留。' };
      setMessage(action==='revalidate'?(result.runtime.status==='ready'?'重新验证通过，可以使用。':'仍有未满足的条件，请查看 Skill 下方说明。'):notices[action] || '操作已完成。');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '操作未完成。'); }
    finally { setBusyId(null); }
  };
  return <div className="page management-page"><PageHeader title={t("Skill 管理")} description={t("管理可信来源、安装版本与更新。更新只提示，由你确认安装。")}><div className="management-header-actions"><Button disabled={scanning || !!busyId || !settings.skillRoots.some(root => root.mode === 'directory')} onClick={async () => { setError(''); try { await scanRoots(); } catch (failure) { setError(failure instanceof Error ? failure.message : '扫描失败'); } }}><RefreshCw size={18} />{scanning ? t("正在扫描…") : t("重新扫描")}</Button><Button disabled={installing || !!busyId} onClick={() => { setInstalling(true); setLocalTarget(undefined); setMessage(''); }}><Plus size={18} />{t("添加 Skill")}</Button></div></PageHeader>
    <BulkSkillUpdates/>{installing && <InstallPanel key={localTarget?.id || 'new'} manage={manageSkill} target={localTarget} close={() => { setInstalling(false); setLocalTarget(undefined); }} completed={setMessage} />}
    <div className="category-tabs" role="group" aria-label={t("管理分类")}>{['已安装', '可更新', '需要配置', '异常'].map(label => <button key={label} className={tab === label ? 'is-selected' : ''} aria-pressed={tab === label} onClick={() => setTab(label)}>{t(label)}</button>)}</div>
    {t(error) && <p className="field-error" role="alert">{t(error)}</p>}{t(message) && <p className="settings-hint" role="status">{t(message)}</p>}
    {!filtered.length ? <EmptyState title={installed.length ? t("此分类暂无 Skill") : t("尚未识别本地 Skill")} description={t("添加可信 GitHub Skill，或选择已有的本地 Skill 文件夹。")} action={<Link href="/settings">{t("设置 Skill 目录 →")}</Link>} /> : <div className="management-list">{filtered.map(manifest => {
      const managed = manifest.installation.rootId === 'managed';
      const busy = !!busyId || installing;
      const view = findSkill(manifest.installation.id);
      return <article className="management-row" key={manifest.installation.id}><div className="management-name"><h3><Link href={`/skills/${manifest.installation.id}`}>{view?.name || skillPresentation(manifest).displayName}</Link></h3><p>{view?.description || skillPresentation(manifest).displayDescription}</p>{!managed && <details><summary>{t("本地来源")}</summary><span className="local-path">{manifest.source.path}</span></details>}{manifest.runtime.issues.length > 0 && <ul className="skill-issues">{manifest.runtime.issues.map(issue => <li key={t(issue)}>{t(issue)}</li>)}</ul>}{manifest.installation.lastError && <p className="field-error">{t(manifest.installation.lastError)}</p>}
        {managed && manifest.runtime.status==='needs_configuration' && <Button disabled={busy} onClick={()=>void run(manifest,'revalidate')}>{t("重新验证")}</Button>}
        {managed && <details className="skill-version-actions"><summary>{t("版本与来源")}</summary><dl className="skill-source-metadata"><div><dt>{t("本地路径")}</dt><dd className="local-path">{manifest.source.path}</dd></div><div><dt>{t("原始名称")}</dt><dd>{manifest.name}</dd></div><div><dt>{t("作者")}</dt><dd>{manifest.source.author || t("未声明")}</dd></div><div><dt>{t("许可证")}</dt><dd>{publicSourceUrl(manifest.source.licenseUrl) ? <a href={publicSourceUrl(manifest.source.licenseUrl)} target="_blank" rel="noreferrer">{t(manifest.source.license) || t("查看许可证")}</a> : t(manifest.source.license) || t("未检测到明确许可")}</dd></div>{manifest.version.commit && <div><dt>Commit</dt><dd className="local-path">{manifest.version.commit}</dd></div>}<div><dt>{t("更新状态")}</dt><dd>{t(updateLabels[manifest.version.updateStatus])}</dd></div><div><dt>{t("检查时间")}</dt><dd>{manifest.version.checkedAt ? new Date(manifest.version.checkedAt).toLocaleString(getLanguage()) : t("尚未检查")}</dd></div><div><dt>{t("上一版本")}</dt><dd>{manifest.installation.previousVersion || t("暂无")}</dd></div></dl>
          {manifest.source.repository&&<SkillChangeInfo manifest={manifest}/>}<div className="skill-management-actions">{window.skillCanvasDesktop && <Button variant="text" onClick={async () => { void window.skillCanvasDesktop!.reveal('skill', manifest.id).catch(failure => setError(failure.message)); }}>{t("在文件夹中显示")}</Button>}{manifest.source.repository ? <><Button disabled={busy} onClick={async () => void run(manifest, 'check')}>{t("检查更新")}</Button><Button disabled={busy || manifest.installation.locked || manifest.version.updateStatus !== 'available'} onClick={async () => void run(manifest, 'update')}>{t("安装更新")}</Button></> : <Button disabled={busy || manifest.installation.locked} onClick={async () => { setLocalTarget(manifest); setInstalling(true); setMessage(''); }}>{t("重新选择目录更新")}</Button>}<Button variant="text" disabled={busy} onClick={async () => void run(manifest, 'lock', { locked: !manifest.installation.locked })}>{manifest.installation.locked ? t("解除锁定") : t("锁定版本")}</Button>{manifest.version.updateStatus === 'available' && <Button variant="text" disabled={busy} onClick={async () => void run(manifest, 'skip')}>{t("跳过此版本")}</Button>}<Button variant="text" disabled={busy || !manifest.installation.previousVersion} onClick={async () => { if (await confirmAction(ui`恢复 ${manifest.name} 的上一版本 ${manifest.installation.previousVersion}？已有项目的绑定版本不会改变。`)) void run(manifest, 'rollback'); }}>{t("回滚上一版本")}</Button><Button variant="text" disabled={busy} onClick={async () => { if (await confirmAction(ui`移除 ${manifest.name}？它将从可用 Skill 中隐藏，不能继续生成；历史项目、版本、Prompt 和原始 PNG 文件都会保留。`)) void run(manifest, 'remove', { confirm: true }); }}>{t("移除 Skill")}</Button></div>{busyId === manifest.id && <p className="settings-hint" role="status">{t("正在校验并处理…")}</p>}
        </details>}
      </div><dl><div><dt>{t("当前版本")}</dt><dd>{versionLabel(manifest) || t("未声明")}</dd></div><div><dt>{t("最新版本")}</dt><dd>{manifest.version.latest || t("未知 / 未检查")}</dd></div><div><dt>{t("来源")}</dt><dd>{publicSourceUrl(manifest.source.repository) ? <a href={publicSourceUrl(manifest.source.repository)} target="_blank" rel="noreferrer">{manifest.source.author || t(sourceLabels[manifest.source.type])}</a> : t(sourceLabels[manifest.source.type])}</dd></div></dl><div className="management-status"><StatusBadge status={view?.status || 'unavailable'} label={view?.presentation?.displayStatus} />{managed && <span className="settings-hint">{t(updateLabels[manifest.version.updateStatus])}</span>}</div></article>;
    })}</div>}
  </div>;
}
