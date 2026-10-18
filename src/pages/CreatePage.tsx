import { t, ui } from '../application/i18n';
import { Sparkles } from 'lucide-react';
import { WorkspaceCanvas } from '../components/WorkspaceCanvas';
import { parameterDefaults } from '../domain/manifest';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useCanvas } from '../application/CanvasProvider';
import { Link, navigate } from '../application/router';
import { art } from '../fixtures/demoSkills';
import { Button, EmptyState, PageHeader, PromptDisclosure, StatusBadge, Thumbnail } from '../components/primitives';
import { ReferenceImages } from '../components/ReferenceImages';
import { DynamicParameters } from '../components/DynamicParameters';
import { SaveIndicator } from '../components/SaveIndicator';
import { toSkillView } from '../application/skillViews';
import { declaredExampleAssets } from '../../bridge/protocol/executionManifest';
import {CreationReuse} from '../components/CreationReuse';
import {SkillPromptGuidance} from '../components/SkillPromptGuidance';

export function CreatePage() {
  const { draft, updateDraft, compilePrompt, startTask, findSkill, ensureProject, activeProject, projects, ready, updateParameter, settings, codexStatus } = useCanvas();
  const currentSkill = findSkill(draft.skillId);
  const pinned = activeProject?.skillSnapshot;
  const sameVersion = !!pinned && !!currentSkill?.manifest && currentSkill.manifest.version.bundle === pinned.version.bundle && currentSkill.manifest.source.fingerprint === pinned.source.fingerprint;
  const skill = pinned ? toSkillView(pinned, sameVersion ? declaredExampleAssets(currentSkill?.manifest) : {}, projects) : currentSkill;
  // The public project list hides dedicated showcases. Reuse catalog presentation
  // only for the exact pinned version; keep its frozen manifest and parameters.
  if (sameVersion && skill && currentSkill) {
    skill.status = currentSkill.status; skill.input = currentSkill.input;
    skill.cover = currentSkill.cover; skill.presentation = currentSkill.presentation;
  }
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const definitions = skill?.manifest?.parameters || [];
  const isAdvanced = (item: typeof definitions[number]) => item.id === 'background' || ['preservation', 'style_strength'].includes(item.id) && /指令|instruction/i.test(item.label) || item.id === 'palette' && /可选|optional/i.test(item.label);
  const basicParameters = definitions.filter(item => !isAdvanced(item));
  const advancedParameters = definitions.filter(isAdvanced);
  const requiredImage=!!skill?.manifest?.inputs.some(input=>input.required&&/图片|image|photo/i.test(input.type));
  const [previewReference,setPreviewReference]=useState('');
  const baseVersion = draft.revision ? activeProject?.generations.flatMap(task => task.versions).find(version => version.taskId === draft.revision?.baseTaskId && (version.outputId || version.id.split(':').at(-1)) === draft.revision?.baseOutputId) : undefined;
  useEffect(() => { if (ready && !activeProject) ensureProject(); }, [ready, activeProject?.id]);
  useLayoutEffect(() => {
    const inputs = document.querySelectorAll<HTMLTextAreaElement>('.workspace-input textarea');
    const fit = () => inputs.forEach(input => { input.style.height = 'auto'; input.style.height = `${Math.min(420, Math.max(input.id === 'prompt' ? 144 : 88, input.scrollHeight))}px`; });
    fit(); let previousWidth = 0;
    const observer = new ResizeObserver(entries => { const width = entries[0].contentRect.width; if (width !== previousWidth) { previousWidth = width; fit(); } });
    const column = document.querySelector('.workspace-input'); if (column) observer.observe(column);
    return () => observer.disconnect();
  }, [draft.prompt, draft.requirements, activeProject?.id, settings.textScale, ready]);
  if (!activeProject || !skill) return <EmptyState title={t("请选择一个 Skill")} description={t("从 Skill 库选择可用 Skill，建立创作项目。")} action={<Link href="/skills">{t("打开 Skill 库")}</Link>} />;
  return <div className="page create-page"><PageHeader back={{ href: baseVersion ? `/result/${baseVersion.taskId}` : `/skills/${skill.id}`, label: baseVersion ? '返回作品结果' : '返回 Skill 详情' }} title={t("生成工作台")} description={ui`使用 ${skill.name} 创建新的视觉作品。`}><SaveIndicator /></PageHeader>
    <div className="workspace-layout"><section className="workspace-input" aria-labelledby="input-title"><h2 id="input-title">{t("创作输入")}</h2>{baseVersion && <p className="muted">{t("正在修改 ")}{baseVersion.label}{t(" · 原图将自动传给 Codex")}</p>}<div className="field"><label>{t("选择 Skill")}</label><Link className="selected-skill" href={`/skills/${skill.id}`}><Thumbnail className="selected-skill-artwork" image={skill.cover} alt="" empty={t("无案例")} /><div><strong>{skill.name}</strong><span>{skill.description}</span></div></Link><p className="workspace-skill-capabilities">{t(skill.input)} · <StatusBadge status={skill.status} label={skill.presentation?.displayStatus} /></p>{pinned && <p className="skill-pinned-version" title={pinned.version.commit || pinned.source.fingerprint}>{t("项目绑定 ")}{skill.version || t("版本未标注")}{currentSkill?.manifest?.version.bundle && currentSkill.manifest.version.bundle !== pinned.version.bundle ? t(" · 保持原版本，不随更新切换") : ''}</p>}</div>
      <div className="field"><label htmlFor="prompt">{t('你想创作什么？')}</label><SkillPromptGuidance instructions={skill.manifest?.instructions || ''} prompt={draft.prompt} onExample={prompt=>{updateDraft({prompt});setError('');document.getElementById('prompt')?.focus();}}/><div className="textarea-wrap"><textarea id="prompt" aria-label={t('提示词')} aria-describedby="prompt-guidance" placeholder={t('描述想生成的内容、使用场景，以及需要出现的文字。')} value={draft.prompt} maxLength={8000} rows={4} onChange={event => { updateDraft({ prompt: event.target.value }); setError(''); }} /><span className="character-count">{draft.prompt.length} / 8000</span></div></div>
      <div className="field"><label htmlFor="requirements">{t("具体要求（可选）")}</label><div className="textarea-wrap requirements"><textarea id="requirements" value={draft.requirements} maxLength={8000} rows={2} onChange={event => updateDraft({ requirements: event.target.value })} /><span className="character-count">{draft.requirements.length} / 8000</span></div></div>
      <div className="field"><label>{t(requiredImage&&!baseVersion?'参考图（必需）':'参考图（可选）')}</label><ReferenceImages images={draft.references} onChange={references => updateDraft({ references })} onPreview={setPreviewReference}/>{requiredImage&&!baseVersion&&!draft.references.length&&<p className="settings-hint">{t('此 Skill 需要参考图，请先上传图片。')}</p>}</div>
    {skill.manifest&&<CreationReuse manifest={skill.manifest}/>}</section><WorkspaceCanvas ratio={draft.ratio} size={draft.size} transparent={draft.parameters?.background === '透明背景'} src={baseVersion?.image || (skill.manifest?.source.type === 'demo' ? draft.skillId === 'minimal-zine' || draft.skillId === 'editorial-poster' ? art('workspace-poster') : skill.after : (draft.references.find(image=>image.id===previewReference)||draft.references[0])?.url)} alt={baseVersion ? ui`续改底图 ${baseVersion.label}` : t('当前项目参考图')} />
    <aside className="workspace-parameters" aria-labelledby="settings-title"><h2 id="settings-title">{t("生成设置")}</h2>
      <DynamicParameters definitions={basicParameters} values={draft.parameters || {}} onChange={updateParameter} />
      {advancedParameters.length > 0 && <details className="workspace-advanced"><summary>{t('更多设置')}</summary><p className="settings-hint">{t('保真与风格强度是创作指令，不是模型质量档位。透明棋盘格仅表示目标背景。')}{!draft.references.length&&!baseVersion&&t('添加参考图后，才能针对具体主体或风格进行保留与借鉴。')}</p><DynamicParameters definitions={advancedParameters} values={draft.parameters || {}} onChange={updateParameter} /></details>}
      <button type="button" className="workspace-reset" onClick={() => updateDraft({ parameters: parameterDefaults(definitions) })}>{t('恢复 Skill 默认值')}</button>
      <p className="settings-hint">{t('尺寸为生成目标，不保证精确像素；不会通过拉伸或压缩原图来凑尺寸。')}</p>
      {draft.count > 1 && <p className="settings-hint">{t('多张图片可能依次生成，实际耗时取决于任务与可用额度。')}</p>}
      <p className="generation-summary">{draft.ratio} · {draft.size} · {ui`${draft.count} 张`} · {draft.format}</p>
      <div className="workspace-generate">{!!window.skillCanvasDesktop&&!codexStatus?.connected&&<p className="generation-unavailable">{t("Codex 未连接，暂时无法生成。")} <Link href="/settings">{t("检查连接")}</Link></p>}<Button variant="primary" className="full-width" disabled={submitting || !!window.skillCanvasDesktop && !codexStatus?.connected} onClick={async () => {
        if (!draft.prompt.trim()) { setError('请输入提示词。'); document.getElementById('prompt')?.focus(); return; }
        if (submitting) return;
        setSubmitting(true); try { const id = await startTask(draft); navigate(`/task/${id}`); } catch (failure) { setError(failure instanceof Error ? failure.message : '无法创建任务'); } finally { setSubmitting(false); }
      }}><Sparkles size={20} />{submitting ? t("正在准备任务…") : t("在 Codex 中生成")}</Button>{t(error) && <p className="field-error" role="alert">{t(error)}</p>}<PromptDisclosure label="查看本次任务内容" prompt={compilePrompt()} /><p className="simulation-note">{settings.codexMode === 'mock' ? t("当前为模拟流程，未连接 Codex") : t("通过本地 Bridge 使用现有 Codex 登录；参考图将复制到本地任务目录。")}</p></div>
    </aside></div>
  </div>;
}
