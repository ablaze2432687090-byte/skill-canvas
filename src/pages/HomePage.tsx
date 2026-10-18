import { t } from '../application/i18n';
import { useState } from 'react';
import { EmptyState, PageHeader, SearchInput, SkillCard } from '../components/primitives';
import { Link, navigate } from '../application/router';
import { useCanvas } from '../application/CanvasProvider';
import { ProjectCard } from '../components/ProjectCard';
import {categoryName} from '../application/customization';

export function HomePage() {
  const [search, setSearch] = useState('');
  const { skills, projects,personal } = useCanvas();
  const availableShortcuts = personal.categories.filter(category=>!category.hidden&&(!personal.home.categoryIds.length||personal.home.categoryIds.includes(category.id))&&skills.some(skill=>skill.categoryId===category.id));
  const recommendedSkills = [...skills].filter(skill=>!skill.personal?.hidden).sort((a,b)=>Number(b.personal?.pinned||false)-Number(a.personal?.pinned||false)||(a.personal?.order||0)-(b.personal?.order||0)||Number(a.manifest?.source.type==='demo')-Number(b.manifest?.source.type==='demo')).slice(0,6);
  return <div className="page home-page">
    <PageHeader title={t("今天想生成什么？")} />
    <SearchInput value={search} onChange={setSearch} onSubmit={() => navigate(`/skills?q=${encodeURIComponent(search.trim())}`)} placeholder={t("搜索 Skill、风格或用途…")} />
    {availableShortcuts.length > 0 && <section className="home-shortcuts" style={{order:personal.home.order.indexOf('shortcuts')+2}} aria-labelledby="shortcut-title"><h2 id="shortcut-title" className="minor-heading">{t("快捷分类")}</h2><div className="shortcut-grid">{availableShortcuts.map(category => <Link className="shortcut" key={category.id} href={`/skills?category=${encodeURIComponent(category.id)}`}><span>{categoryName(category)}</span></Link>)}</div></section>}
    <section className="home-recommended" style={{order:personal.home.order.indexOf('recommended')+2}} aria-labelledby="recommend-title"><h2 id="recommend-title">{t("精选 Skill")}</h2>{!recommendedSkills.length && <EmptyState title={t("还没有可展示的 Skill")} description={t("添加 Skill 后，你的精选内容会显示在这里。")} action={<Link href="/manage">{t("添加 Skill →")}</Link>} />}<div className="recommended-grid">{recommendedSkills.map(skill => <SkillCard key={skill.id} skill={skill} compact />)}</div></section>
    {personal.home.showRecent&&<section className="home-recent" style={{order:personal.home.order.indexOf('recent')+2}} data-expanded={personal.home.recentCount>6} aria-labelledby="recent-title"><h2 id="recent-title">{t("最近创作")}</h2>{projects.length ? <div className="recent-grid">{[...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, personal.home.recentCount).map(project => <ProjectCard key={project.id} project={project} />)}</div> : <EmptyState title={t("还没有创作项目")} description={t("选择一个 Skill，开始你的第一份创作。")} />}</section>}
  </div>;
}
