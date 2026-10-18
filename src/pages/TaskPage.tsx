import {confirmAction} from '../components/AppDialogs';
import { getLanguage } from '../application/i18n';
import { t, ui } from '../application/i18n';
import { useEffect, useState } from 'react';
import { PreviewImage } from '../components/ImageLightbox';
import { Check, ChevronRight } from 'lucide-react';
import { useCanvas } from '../application/CanvasProvider';
import { navigate } from '../application/router';
import { art } from '../fixtures/demoSkills';
import { Button, EmptyState, PageHeader } from '../components/primitives';
import { stageLabels } from '../../bridge/protocol/task';
import type { Generation } from '../domain/types';
import { SaveIndicator } from '../components/SaveIndicator';

const steps = ['解析输入', '编译 Prompt', '发送至 Codex', '生成图片', '质量检查', '返回结果'];
const clock = (seconds: number) => `00:${Math.max(0, seconds).toString().padStart(2, '0')}`;
export function TaskPage({ id }: { id: string }) {
  const { generations, finishTask, cancelTask, findSkill } = useCanvas();
  const task = generations.find(item => item.id === id);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => { if (task?.status === 'completed' && task.versions.length) navigate(`/result/${id}`, true); }, [task?.status, task?.versions.length, id]);
  if (!task) return <EmptyState title={t("找不到这个任务")} description={t("请从生成工作台开始一个新的任务。")} action={<Button onClick={() => navigate('/create')}>{t("返回工作台")}</Button>} />;
  if (task.codex) return <RealTask task={task} />;
  if (task.status === 'cancelled') return <EmptyState title={t("模拟任务已取消")} description={t("你的提示词和参考图仍保留在工作台中。")} action={<Button onClick={() => navigate('/create')}>{t("返回工作台")}</Button>} />;
  if (task.status === 'failed') return <EmptyState title={t("任务执行失败")} description={t(task.error) || t("请返回工作台检查输入。")} action={<Button onClick={() => navigate('/create')}>{t("返回工作台")}</Button>} />;
  const seconds = Math.min(Math.floor((now - task.startedAt) / 1000), task.duration / 1000);
  const active = Math.min(Math.floor((now - task.startedAt) / (task.duration / steps.length)), steps.length - 1);
  const skill = findSkill(task.draft.skillId);
  return <div className="page task-page"><PageHeader back={{ href: '/projects', label: '返回我的创作（任务继续执行）' }} title={t("Codex 正在创建你的作品")} description={ui`${skill?.name || task.skillName || '未知 Skill'} · 模拟执行，未连接 Codex`} />
    <ol className="execution-steps" aria-label={t("模拟执行进度")}>{steps.map((step, index) => <li key={step} className={index < active ? 'is-done' : index === active ? 'is-active' : ''} aria-current={index === active ? 'step' : undefined}><span className="step-indicator">{index < active && <Check size={17} />}</span><span>{t(step)}</span></li>)}</ol>
    <div className="task-layout"><section className="task-summary" aria-live="polite"><p className="muted">{t("当前状态")}</p><h2>{t("正在模拟：")}{steps[active]}…</h2><dl className="task-time"><div><dt>{t("已用时间")}</dt><dd>{clock(seconds)}</dd></div><div><dt>{t("预计剩余时间")}</dt><dd>{clock(Math.ceil(task.duration / 1000 - seconds))}</dd></div></dl><p className="task-note">{t("你可以离开此页面，模拟任务会继续执行。")}</p><details className="error-disclosure"><summary><ChevronRight size={20} />{t("错误信息（无）")}</summary><p>{t("模拟执行未发现错误。")}</p></details></section>
    <section className="task-preview" aria-label={t("模拟生成预览")}><PreviewImage src={skill?.manifest?.source.type === 'demo' ? art('progress-poster') : '/artwork/mock-result.svg'} alt={t("模拟过程中的作品预览")} /><div className="preview-veil"><span className="spinner" aria-hidden="true" /><span>{t("正在模拟生成…")}</span></div></section></div>
    <div className="task-actions"><Button variant="text" onClick={() => finishTask(id)}>{t("完成模拟并查看结果")}</Button><Button onClick={() => { void cancelTask(id); }}>{t("取消生成")}</Button></div>
  </div>;
}

function RealTask({ task }: { task: Generation }) {
  const { cancelTask, restoreCodexTask, cleanCodexTask, retryTask, enqueueTask,generations } = useCanvas();
  const handle = task.codex!;
  const previousResult = generations.find(item => item.projectId === task.projectId && item.id !== task.id && item.status === 'completed' && item.versions.length);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const run = async (operation: () => Promise<void>) => { setBusy(true); setMessage(''); try { await operation(); } catch (error) { setMessage(error instanceof Error ? error.message : '操作未完成'); } finally { setBusy(false); } };
  const index = { queued:0,preparing: 0, compiling: 1, connecting: 2, submitted: 2, running: 3, waiting: 2, completed: 5, failed: 3, cancelled: 3, interrupted: 3 }[handle.stage];
  const terminal = ['completed', 'failed', 'cancelled', 'interrupted', 'waiting'].includes(handle.stage);
  const title=({failed:'任务生成失败',cancelled:'生成已取消',interrupted:'生成已中断',waiting:'等待确认',completed:'作品已生成'} as Record<string,string>)[handle.stage]||'Codex 正在创建你的作品';
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(handle.startedAt)) / 1000));
  return <div className="page task-page"><PageHeader back={{ href: '/projects', label: '返回我的创作（任务继续执行）' }} title={handle.action === 'bridge_test' ? t("Codex 连接验证") : t(title)} description={ui`${task.skillName} · 真实任务 · ${t(stageLabels[handle.stage])}`}><SaveIndicator /></PageHeader>
    <ol className="execution-steps" aria-label={t("Codex 执行进度")}>{steps.map((step, i) => <li key={step} className={i < index ? 'is-done' : i === index ? terminal && handle.stage!=='completed'?'is-stopped':'is-active' : ''}><span className="step-indicator">{i < index && <Check size={17} />}</span><span>{handle.action === 'bridge_test' && i === 3 ? t("验证连接") : t(step)}</span></li>)}</ol>
    <div className="task-layout"><section className="task-summary" aria-live="polite"><p className="muted">{t("当前状态")}</p><h2>{t(stageLabels[handle.stage])}</h2><dl className="task-time"><div><dt>{terminal ? t("最后更新时间") : t("已用时间")}</dt><dd>{terminal ? new Date(handle.updatedAt).toLocaleTimeString(getLanguage()) : `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`}</dd></div></dl>
      <p className="task-note">{t("任务由本地 Bridge 进程执行。请保持 Bridge 运行；页面刷新后会重新连接。停止 Bridge 可能中断任务。")}</p>
      {(task.error || message) && <p role="alert" className="field-error">{t(message) || t(task.error)}</p>}
      <details className="error-disclosure"><summary>{t("执行详情")}</summary><p className="local-path">Thread：{handle.threadId || t("尚未创建")}<br />Turn：{handle.turnId || t("尚未提交")}<br />{t("工作区：")}{handle.workspace}</p>{handle.error?.detail && <pre className="prompt-text">{handle.error.detail}</pre>}</details>
    </section><section className="task-preview real-task-preview" aria-label={t("Codex 执行内容")}>{handle.action === 'bridge_test' ? <p className="prompt-text">{handle.text || t("等待真实 Codex 回复…")}</p> : <div className="canvas-empty"><p>{handle.stage === 'waiting' ? t("在 Codex 中确认执行") : handle.stage === 'completed' ? t("正在打开已验证作品") : terminal?t("未生成新的图片"):t("等待已验证的图片")}</p><span>{t("不会用模拟图片替代真实结果。")}</span></div>}</section></div>
    <div className="task-actions">
      {handle.stage==='queued'?<Button disabled={busy||!handle.queuePaused} onClick={async()=>{if(await confirmAction(t('继续排队后将发送到 Codex，可能消耗额度。继续？')))void run(()=>enqueueTask(task.id));}}>{handle.queuePaused?t('继续排队'):t('等待执行名额')}</Button>:(['interrupted','waiting','failed'].includes(handle.stage)||!!task.error)?<Button disabled={busy} onClick={async () => void run(() => restoreCodexTask(task.id))}>{t("恢复连接")}</Button>:null}{!terminal && <Button disabled={busy} onClick={async () => void run(() => cancelTask(task.id))}>{t("取消生成")}</Button>}
      {terminal && handle.stage !== 'completed' && <Button disabled={busy} onClick={async () => {if(await confirmAction(t('重试会先核对已有结果，必要时新建 Turn 并消耗额度；原失败记录保留。继续？')))void run(async () => navigate(`/task/${await retryTask(task.id)}`));}}>{t("重试")}</Button>}
      {terminal && <Button onClick={() => navigate('/create')}>{t("返回工作台")}</Button>}
      {terminal && handle.stage !== 'completed' && previousResult && <Button onClick={() => navigate(`/result/${previousResult.id}`)}>{t("查看已有版本")}</Button>}
      {terminal && <Button variant="text" disabled={busy} onClick={async () => { if (await confirmAction(t("清理此任务的临时输入与输出？正式项目、原图、参考图与线程记录会保留。"))) void run(async () => { await cleanCodexTask(task.id); setMessage('任务工作区已清理。'); }); }}>{t("清理任务文件")}</Button>}
    </div>
  </div>;
}
