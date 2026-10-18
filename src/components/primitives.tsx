import { t, ui } from '../application/i18n';
import { ArrowLeft, ArrowRight, ChevronDown, Image, Search } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {useCanvas} from '../application/CanvasProvider';
import type { Skill, SkillStatus } from '../domain/types';
import { Link, navigate } from '../application/router';
import { PreviewImage } from './ImageLightbox';

export function PageHeader({ title, description, children, back }: { title: ReactNode; description?: ReactNode; children?: ReactNode; back?: { href: string; label: string } }) {
  const backHref = back?.href;
  useEffect(() => {
    if (!backHref) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      // A modal or open menu owns the first Escape; it must not also leave the page.
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="menu"], [aria-expanded="true"][role="combobox"]') || (event.target as HTMLElement)?.tagName === 'SELECT') return;
      event.preventDefault();
      navigate(backHref);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [backHref]);
  const copy = <div className="page-header-copy"><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>;
  return <header className="page-header">{back ? <div className="page-header-leading"><Link className="page-back" href={back.href} aria-label={t(back.label)} title={t(back.label)}><ArrowLeft aria-hidden="true" /></Link>{copy}</div> : copy}{children}</header>;
}
export function Button({ variant = 'secondary', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'text' }) {
  return <button type="button" {...props} className={`button button-${variant} ${className}`}>{children}</button>;
}
export function SearchInput({ value, onChange, onSubmit, placeholder = '搜索 Skill 名称…' }: { value: string; onChange: (value: string) => void; onSubmit?: () => void; placeholder?: string }) {
  return <form className="search-input" role="search" onSubmit={event => { event.preventDefault(); onSubmit?.(); }}>
    <Search aria-hidden="true" /><input aria-label={t(placeholder)} value={value} placeholder={t(placeholder)} onChange={event => onChange(event.target.value)} />
    <button className="search-submit" type="submit" aria-label={t("搜索")}><ArrowRight aria-hidden="true" /></button>
  </form>;
}
export function StatusBadge({ status, label }: { status: SkillStatus; label?: string }) {
  const labels = { installed: '可用', update: '可用', demo: '演示 Skill', configuration: '需要配置', invalid: '暂不可用', unavailable: '暂不可用' };
  return <span className={`status-badge status-${label === '待验证' ? 'configuration' : status}`}><i aria-hidden="true" />{t(status === 'demo' ? labels.demo : label || labels[status])}</span>;
}
export function SkillCard({ skill, compact = false,selection }: { skill: Skill; compact?: boolean;selection?:{selected:boolean;toggle:()=>void} }) {
  return <article className={`skill-card ${compact ? 'skill-card-compact' : ''}`} data-skill-id={skill.id} data-example-source={skill.presentation?.featuredExample?.exampleSource} data-example-id={skill.presentation?.featuredExample?.id}>
    {selection&&<label className="skill-selection"><input type="checkbox" checked={selection.selected} onChange={selection.toggle} aria-label={ui`选择 ${skill.name}`}/></label>}
    <Link href={`/skills/${skill.id}`} className="image-card skill-cover" aria-label={ui`查看 ${skill.name} 详情`}><Thumbnail image={compact ? skill.homeCover || skill.cover : skill.cover} alt={ui`${skill.name} 示例作品`} focusX={skill.personal?.cover?.focusX} focusY={skill.personal?.cover?.focusY} empty={t("暂无验证案例")} /></Link>
    <div className="skill-card-heading"><h3><Link href={`/skills/${skill.id}`} title={skill.name}>{skill.name}</Link></h3>{skill.version && <span className="skill-card-version" title={t(skill.version)}>{t(skill.version)}</span>}</div>
    <p>{skill.description}</p>
    {!!skill.personal?.tags?.length&&<div className="skill-personal-tags">{skill.personal.tags.slice(0,2).map(tag=><span key={tag}>#{tag}</span>)}{skill.personal.tags.length>2&&<span title={skill.personal.tags.slice(2).join(", ")}>+{skill.personal.tags.length-2}</span>}</div>}
    <div className="skill-capabilities">{skill.input.split('、').map(part => t(part)).join(' / ')}<span> · {t(skill.categories[0]) || t("未分类")}</span></div>
    <div className="skill-card-meta"><StatusBadge status={skill.status} label={skill.presentation?.displayStatus} /><Link className="subtle-link" href={`/skills/${skill.id}`}>{t("查看详情 ")}<ArrowRight /></Link></div>
  </article>;
}
type ArtworkProps = { image?: string | null; alt: string; empty: string; children?: ReactNode;focusX?:number;focusY?:number };
export function Artwork({ image, alt, empty, children,focusX=50,focusY=50 }: ArtworkProps) {
  const {getPersonalMedia}=useCanvas();const placeholder=useRef<HTMLSpanElement>(null),[resolved,setResolved]=useState<{key:string;url:string}>();
  const [failedImage, setFailedImage] = useState('');
  const personal=image?.startsWith('personal-media:');
  useEffect(()=>{if(!personal||!image)return;let active=true;const load=()=>{void getPersonalMedia(image.slice(15)).then(url=>{if(active)setResolved({key:image,url});}).catch(()=>{if(active)setFailedImage(image);});};const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'240px'});if(placeholder.current)observer.observe(placeholder.current);else load();return()=>{active=false;observer.disconnect();};},[image]);
  const source=personal?(resolved?.key===image?resolved?.url:''):image;
  if(personal&&!source&&failedImage!==image)return <span ref={placeholder} className="artwork-empty"><Image size={24} aria-hidden="true"/></span>;
  return source && failedImage !== image ? <PreviewImage src={source} style={{objectPosition:`${focusX}% ${focusY}%`}} alt={alt} loading="lazy" decoding="async" onError={() => setFailedImage(image||'')} />
    : <span className="artwork-empty"><Image size={24} aria-hidden="true" /><span>{image ? t("图片暂不可用") : empty}</span>{children}</span>;
}
/** A stable portrait viewport; legacy artwork always keeps its original composition. */
export function Thumbnail({ className = '', ...props }: ArtworkProps & { className?: string }) {
  return <span className={`artwork-thumbnail ${className}`} data-thumbnail-ratio="3:4"><Artwork {...props} /></span>;
}
export function ParameterControl<T extends string | number>({ label, values, value, onChange }: { label: string; values: readonly T[]; value: T; onChange: (value: T) => void }) {
  return <fieldset className="parameter-control"><legend>{t(label)}</legend><div className="segmented" role="group" aria-label={t(label)}>{values.map(option => <button type="button" key={option} className={value === option ? 'is-selected' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{t(option)}</button>)}</div></fieldset>;
}
export function SelectControl({ label, value, onChange, options, inline = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; inline?: boolean }) {
  return <label className={`select-control ${inline ? 'select-inline' : ''}`}><span>{t(label)}</span><div className="select-wrap"><select aria-label={t(label)} value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select><ChevronDown aria-hidden="true" /></div></label>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><h2>{t(title)}</h2><p>{t(description)}</p>{action}</div>;
}
export function PromptDisclosure({ prompt, label = '查看最终 Prompt ' }: { prompt: string; label?: string }) {
  return <details className="prompt-disclosure"><summary>{t(label)}<ChevronDown aria-hidden="true" /></summary><p className="prompt-text">{prompt}</p></details>;
}
