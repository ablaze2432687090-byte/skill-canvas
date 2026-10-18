import {confirmAction} from '../components/AppDialogs';
import { t, ui, skillText } from '../application/i18n';
import { useState } from 'react';
import { useCanvas } from '../application/CanvasProvider';
import { navigate } from '../application/router';
import { supportsSingleShowcase } from '../application/showcase';
import { Button } from './primitives';

export function ShowcaseControls({ skillId }: { skillId: string }) {
  const { generateShowcase, showcaseForSkill, findSkill, openProject } = useCanvas();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const projects = showcaseForSkill(skillId), skill = findSkill(skillId);
  const running = busy || projects.some(project => ['draft', 'queued', 'running'].includes(project.status));
  const total = skill?.presentation?.examples.length || 0;
  const single = !!skill?.manifest && supportsSingleShowcase(skill.manifest);
  const mixed = skill?.presentation?.examples.some(example => example.exampleSource === 'repository');
  return <section className="showcase-controls" aria-label={t("Skill 封面与案例生成")}>
    <div className="showcase-control-heading"><span>{ui`封面 ${total ? 1 : 0}/1 · 用途案例 ${Math.min(1, Math.max(0, total - 1))}/1`}</span><Button variant="text" disabled={running || !single || skill?.manifest?.runtime.status !== 'ready'} title={!single ? t("此 Skill 通过工作台成组生成，成功结果自动关联为案例。") : undefined} onClick={async () => {
      if (!await confirmAction(t("通过 Codex 内置 ImageGen 生成 1 张封面和 1 张用途案例，消耗当前账户的图片生成额度。成功后替换展示，历史记录仍保留。继续？"))) return;
      setBusy(true); setError('');
      try { await generateShowcase(skillId); }
      catch (failure) { setError(failure instanceof Error ? failure.message : '生成未提交'); }
      finally { setBusy(false); }
    }}>{running ? t("正在生成…") : projects.length ? t("重新生成") : t("生成封面与案例")}</Button></div>
    <p className="settings-hint">{mixed ? t("仓库案例与本机实测分别标注来源，绑定当前 Skill 版本；本机结果可查看 Prompt 与任务记录。") : t("通过 Codex 生成，绑定当前 Skill 版本；不是作者案例。每张独立保存，可查看 Prompt 与任务记录。")}</p>
    {!!projects.length && <ul className="showcase-task-list">{projects.map(project => {
      const task = project.generations[0];
      const label = project.status === 'completed' ? '已完成' : project.status === 'failed' ? '失败 · 可重试' : project.status === 'cancelled' ? '已取消' : '生成中';
      return <li key={project.id}><span>{skillText(project.showcase?.label)}</span>{task ? <Button variant="text" onClick={() => { openProject(project.id); navigate(`/task/${task.id}`); }}>{t(label)} →</Button> : <span>{t(project.showcaseError) || t(label)}</span>}</li>;
    })}</ul>}
    {t(error) && <p className="field-error" role="alert">{t(error)}</p>}
  </section>;
}
