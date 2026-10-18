import { t } from '../application/i18n';
import { Home, Grid2X2, Folder, Layers, Settings, ArrowUp, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from '../application/router';
import { useCanvas } from '../application/CanvasProvider';
import { ImageLightbox, type PreviewItem } from './ImageLightbox';
import {KeyboardBindings} from './KeyboardShortcuts';
import {BackupHeartbeat} from './ScheduledBackup';
import {AppDialogHost} from './AppDialogs';
import {FloatingMenus} from './FloatingMenus';

const nav = [
  { href: '/', label: '首页', icon: Home },
  { href: '/skills', label: 'Skill 库', icon: Grid2X2 },
  { href: '/projects', label: '我的创作', icon: Folder },
  { href: '/manage', label: 'Skill 管理', icon: Layers },
  { href: '/settings', label: '设置', icon: Settings },
];
export function Sidebar() {
  const { path } = useLocation();
  const selected = path.startsWith('/skills') ? '/skills'
    : /^\/(projects|create|task|result)(\/|$)/.test(path) ? '/projects'
    : path === '/home' ? '/' : path;
  return <aside className="sidebar">
    <Link className="brand" href="/" aria-label={t("Skill Canvas 首页")}>
      <svg className="brand-mark" viewBox="0 0 26 28" aria-hidden="true"><path d="M2 8 12 4v21L2 29zm14-5L26 0v21l-10 4z" fill="currentColor" /></svg>
      <span>Skill Canvas</span>
    </Link>
    <nav aria-label={t("主导航")}>{nav.map(({ href, label, icon: Icon }) =>
      <Link key={href} href={href} className={`nav-item ${selected === href ? 'is-selected' : ''}`} aria-current={selected === href ? 'page' : undefined}>
        <Icon aria-hidden="true" /><span>{t(label)}</span>
      </Link>,
    )}</nav>
  </aside>;
}
export function AppShell({ children }: { children: ReactNode }) {
  const { ready, refreshView,findSkill,getPersonalMedia,getAsset } = useCanvas();
  const {path}=useLocation();
  const [previewError,setPreviewError]=useState('');
  const [showTop, setShowTop] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [preview, setPreview] = useState<{ images: PreviewItem[]; index: number } | null>(null);
  const openImage = (image: HTMLImageElement) => {
    if (!image.naturalWidth || !image.src) return false;
    const group = image.closest('.detail-page .detail-artwork');
    if (!group) return false;
    const skill=findSkill(path.split('/')[2]);
    if(skill){
      const origin=path;
      void Promise.all((skill.presentation?.examples||[]).map(async example=>({src:example.image.startsWith('personal-media:')?await getPersonalMedia(example.image.slice(15)):example.image.startsWith('asset:')?await getAsset(example.image):new URL(example.image,window.location.href).href,label:example.label}))).then(images=>{if(window.location.pathname!==origin)return;const matching=skill.presentation?.examples.findIndex(item=>item.image===image.dataset.assetKey);const index=matching!==undefined&&matching>=0?matching:images.findIndex(item=>item.src===image.src);if(index>=0){setPreviewError('');setPreview({images,index});}}).catch(()=>setPreviewError('图片暂不可用，请关闭后刷新重试。'));
      return true;
    }
    const images: PreviewItem[] = [];
    for (const element of group.querySelectorAll<HTMLImageElement>('img[data-preview-image]')) {
      if (element.src && !images.some(item => item.src === element.src)) images.push({ src: element.src, label: element.alt || element.closest('figure')?.querySelector('figcaption strong')?.textContent || '图片' });
    }
    const index = images.findIndex(item => item.src === image.src);
    if (index < 0) return false;
    setPreview({ images, index }); return true;
  };
  const refresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true);
    try { await refreshView(); } catch { /* Provider displays the actionable error. */ }
    finally { refreshingRef.current = false; setRefreshing(false); }
  };
  useEffect(() => {
    const update = () => setShowTop(window.scrollY > 1);
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return <div className={`app-shell${path === '/create' ? ' has-workspace' : ''}`}><FloatingMenus/><AppDialogHost/><BackupHeartbeat/><KeyboardBindings/><Sidebar /><main id="main-content" className="main-content" onClickCapture={event => {
    if (event.target instanceof HTMLImageElement && event.target.matches('[data-preview-image]') && openImage(event.target)) { event.preventDefault(); event.stopPropagation(); }
  }} onKeyDownCapture={event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLImageElement && event.target.matches('[data-preview-image]') && openImage(event.target)) { event.preventDefault(); event.stopPropagation(); }
  }}>{previewError&&<p role="alert" className="field-error">{t(previewError)}</p>}{children}</main>
    {preview && <ImageLightbox images={preview.images} initialIndex={preview.index} onClose={() => setPreview(null)} />}
    <div className="floating-page-actions" role="toolbar" aria-label={t("页面操作")}>
      <button className="floating-page-button back-to-top" type="button" aria-label={t("返回顶部")} title={t("返回顶部")} disabled={!showTop} onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}><ArrowUp aria-hidden="true" /></button>
      <button className="floating-page-button page-refresh" type="button" aria-label={t("刷新当前页面")} title={t("刷新")} disabled={!ready || refreshing} aria-busy={refreshing} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={refreshing ? 'is-refreshing' : ''} /></button>
    </div>
  </div>;
}
