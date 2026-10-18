import { t } from '../application/i18n';
import { Bookmark, Box, Code2, Image, Layers, Play, Shapes, FileImage } from 'lucide-react';
import { useCanvas } from '../application/CanvasProvider';
import { navigate } from '../application/router';
import { Button, EmptyState, PageHeader, StatusBadge, Thumbnail } from '../components/primitives';
import { publicSourceUrl, sourceLabels, updateLabels } from '../components/ManagedSkills';
import { ShowcaseControls } from '../components/ShowcaseControls';
import {SkillDisplayEditor} from '../components/SkillDisplayEditor';

function showcaseLabel(label: string, fallback: string) {
  return /renewed cover|\/\s*(?:cover|use case)\s*$/i.test(label) ? t(fallback) : label.replace('本机实测 · ', '');
}

export function SkillDetailPage({ id }: { id: string }) {
  const { selectSkill, findSkill, toggleFavorite, settings } = useCanvas();
  const skill = findSkill(id);
  if (!skill) return <EmptyState title={t("找不到这个 Skill")} description={t("请从 Skill 库选择已安装的 Skill。")} action={<Button onClick={() => navigate('/skills')}>{t("返回 Skill 库")}</Button>} />;
  const manifest = skill.manifest!;
  const favorite = manifest.installation.favorite;
  const needsConfiguration=manifest.runtime.status==='needs_configuration';
  const info = [
    { icon: Shapes, label: '分类', value: skill.categories.map(category => t(category)).join(' / ') || t('未分类') },
    { icon: Image, label: '输入能力', value: skill.input.split('、').map(part => t(part)).join(' / ') },
    { icon: FileImage, label: '输出格式', value: skill.formats.join('、') || '未声明' },
    { icon: Box, label: '运行方式', value: settings.codexMode === 'mock' ? '前端模拟 · Codex 未连接' : 'Codex · 本地 Bridge · ChatGPT 登录' },
    { icon: Code2, label: '来源 / 作者', value: `${t(sourceLabels[manifest.source.type])} / ${manifest.source.author || t('未声明')}` },
    { icon: Layers, label: '当前版本', value: skill.version || '版本未标注' },
  ];
  const featured = skill.presentation?.featuredExample;
  const cases = featured ? [featured, ...(skill.presentation?.examples || []).filter(example => example.id !== featured.id)] : skill.presentation?.examples || [];
  const sourceLabel = { repository: '仓库案例', author: '作者案例', local_verified: '本机实测', generated_showcase: '本机生成示例', demo: '演示案例', personal_upload:'自行上传' };
  return <div className="page detail-page"><div className="detail-heading"><PageHeader back={{ href: '/skills', label: '返回 Skill 库' }} title={skill.name} description={skill.description} /></div>
    <div className="detail-layout"><section className="detail-artwork" aria-label={t("Skill 生成效果")}>{cases.length ? <>
      <figure className="featured-example" data-example-id={cases[0].id} data-example-source={cases[0].exampleSource} data-task-id={cases[0].taskId} data-sha256={cases[0].sha256}><Thumbnail image={cases[0].image} focusX={skill.personal?.cover?.focusX} focusY={skill.personal?.cover?.focusY} alt={`${skill.name} · ${cases[0].label}`} empty={t("暂无验证案例")} /><figcaption><strong>{showcaseLabel(cases[0].label, '风格封面')}</strong><span>{t(sourceLabel[cases[0].exampleSource])}{cases[0].verified ? t(" · 已验证 PNG") : t(" · 来源声明，未实测")}</span>{cases[0].purpose && !/renewed distinct|representative cover/i.test(cases[0].purpose) && <p>{cases[0].purpose}</p>}{publicSourceUrl(cases[0].sourceUrl) && <a href={publicSourceUrl(cases[0].sourceUrl)} target="_blank" rel="noreferrer">{t("查看固定版本来源")}</a>}{cases[0].finalPrompt && <details><summary>{t("查看案例 Prompt")}</summary><pre>{cases[0].finalPrompt}</pre></details>}</figcaption></figure>
      {cases.length > 1 && <><h2>{t("用途案例")}</h2><div className="example-gallery">{cases.slice(1).map(example => <figure key={example.id} data-task-id={example.taskId} data-sha256={example.sha256}><Thumbnail image={example.image} focusX={skill.personal?.example?.focusX} focusY={skill.personal?.example?.focusY} alt={example.label} empty={t("案例暂不可用")} /><figcaption><strong>{showcaseLabel(example.label, '用途示例')}</strong><span>{t(sourceLabel[example.exampleSource])}{example.purpose ? ` · ${example.purpose}` : ''}</span>{publicSourceUrl(example.sourceUrl) && <a href={publicSourceUrl(example.sourceUrl)} target="_blank" rel="noreferrer">{t("查看固定版本来源")}</a>}{example.finalPrompt && <details><summary>{t("查看案例 Prompt")}</summary><pre>{example.finalPrompt}</pre></details>}</figcaption></figure>)}</div></>}
    </> : <div className="no-examples"><EmptyState title={t("暂无验证案例")} description={t("此 Skill 尚无可信案例，首次成功生成后会关联本机实测结果。")} /></div>}
      <details className="skill-instructions"><summary>{t("原始介绍与使用说明")}</summary><p className="raw-skill-name">{t("原始名称：")}{manifest.name}</p><p>{manifest.description}</p><pre>{manifest.instructions || t("未声明")}</pre></details>
    </section><aside className="detail-info" aria-label={t("Skill 信息")}><dl>{info.map(({ icon: Icon, label, value }) => <div className="info-row" key={label}><dt><Icon aria-hidden="true" /><span>{t(label)}</span></dt><dd>{t(value)}</dd></div>)}</dl>
      {manifest.source.type !== 'demo' && <details className="skill-source-details"><summary>{t("来源、版本与许可记录")}</summary><dl className="skill-source-metadata"><div><dt>{t("本地路径")}</dt><dd className="local-path">{manifest.source.path}</dd></div>{manifest.installation.rootId === 'managed' && <><div><dt>{t("最新版本")}</dt><dd>{manifest.version.latest || t("尚未检查")}</dd></div><div><dt>{t("更新状态")}</dt><dd>{t(updateLabels[manifest.version.updateStatus])}</dd></div></>}<div><dt>{t("许可证")}</dt><dd>{publicSourceUrl(manifest.source.licenseUrl) ? <a href={publicSourceUrl(manifest.source.licenseUrl)} target="_blank" rel="noreferrer">{t(manifest.source.license) || t("查看许可证文件")}</a> : t(manifest.source.license) || t('未检测到明确许可')}</dd></div><div><dt>{t("许可状态")}</dt><dd>{t(manifest.source.licenseStatus) || t("尚未核对")}</dd></div>{manifest.source.defaultBranch && <div><dt>{t("默认分支")}</dt><dd>{manifest.source.defaultBranch}</dd></div>}{manifest.version.commit && <div><dt>Commit</dt><dd className="local-path">{manifest.version.commit}</dd></div>}{publicSourceUrl(manifest.source.releaseUrl) && <div><dt>{t("发布记录")}</dt><dd><a href={publicSourceUrl(manifest.source.releaseUrl)} target="_blank" rel="noreferrer">{t("查看 Release")}</a></dd></div>}</dl><p className="settings-hint">{t("这里记录来源声明，不代表使用或再分发许可的法律判断。")}</p></details>}
      <Button variant="primary" className="full-width use-skill" disabled={['invalid', 'unavailable', 'incompatible'].includes(manifest.runtime.status)} onClick={() => { if(needsConfiguration){navigate('/manage?tab=configuration');return;}selectSkill(skill.id); navigate('/create'); }}><Play fill="currentColor" size={18} />{t(needsConfiguration?"前往配置":"使用此 Skill")}</Button>
      <div className="detail-actions"><Button variant="text" aria-pressed={favorite} onClick={() => toggleFavorite(id)}><Bookmark fill={favorite ? 'currentColor' : 'none'} />{favorite ? t("已收藏") : t("收藏")}</Button>{publicSourceUrl(manifest.source.repository) ? <a className="button button-text" href={publicSourceUrl(manifest.source.repository)} target="_blank" rel="noreferrer"><Code2 />{t("查看 GitHub")}</a> : <Button variant="text" disabled title={t("未声明 GitHub 来源")}><Code2 />{t("查看 GitHub")}</Button>}</div>
      <StatusBadge status={skill.status} label={skill.presentation?.displayStatus} />
      {manifest.source.type !== 'demo' && <ShowcaseControls skillId={id} />}
      <SkillDisplayEditor skill={skill}/>
      {manifest.runtime.issues.length > 0 && <ul className="skill-issues">{manifest.runtime.issues.map(issue => <li key={t(issue)}>{t(issue)}</li>)}</ul>}
    </aside></div>
  </div>;
}
