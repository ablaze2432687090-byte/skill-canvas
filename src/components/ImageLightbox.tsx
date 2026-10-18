import { t, ui } from '../application/i18n';
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import { useLocation } from '../application/router';
import {useCanvas} from '../application/CanvasProvider';

export interface PreviewItem { src: string; label: string }
export function PreviewImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const { path } = useLocation();
  const {getAsset}=useCanvas(),element=useRef<HTMLSpanElement>(null),[resolved,setResolved]=useState<{key:string;url:string}>(),[error,setError]=useState('');
  const key=typeof props.src==='string'&&props.src.startsWith('asset:')?props.src:null;
  useEffect(()=>{if(!key)return;let active=true;const load=()=>{void getAsset(key,props.loading==='lazy').then(url=>{if(active)setResolved({key,url});}).catch(()=>{if(active)setError(key);});};const observer=new IntersectionObserver(entries=>{if(entries.some(item=>item.isIntersecting)){observer.disconnect();load();}},{rootMargin:'240px'});if(element.current)observer.observe(element.current);else load();return()=>{active=false;observer.disconnect();};},[key,getAsset,props.loading]);
  if(key&&resolved?.key!==key)return <span ref={element} className="artwork-empty" role={error===key?'img':undefined} aria-label={error===key?t('图片暂不可用'):t('正在加载图片')}>{error===key?t('图片暂不可用'):''}</span>;
  const imageProps={...props,src:key?resolved?.url:props.src,'data-asset-key':key||undefined};
  if (!/^\/skills\/[^/]+$/.test(path)) return <img {...imageProps} />;
  return <img {...imageProps} data-preview-image="true" tabIndex={0} role="button" aria-label={ui`放大查看：${props.alt || '图片'}`} />;
}

export function ImageLightbox({ images, initialIndex, onClose }: { images: PreviewItem[]; initialIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), stage = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const zoom = view.zoom;
  const drag = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const backdropDown = useRef(false);
  const item = images[index];
  const ratio = natural.width && natural.height ? Math.min((size.width - 64) / natural.width, (size.height - 24) / natural.height, 1) : 0;
  const width = Math.max(0, natural.width * ratio * zoom), height = Math.max(0, natural.height * ratio * zoom);
  const bound = (value: number, extent: number) => Math.max(-extent, Math.min(extent, value));
  const zoomTo = (next: number | ((current: number) => number), point = { x: 0, y: 0 }) => {
    if (!ratio) return;
    setView(current => {
      const zoom = Math.max(.5, Math.min(8, typeof next === 'function' ? next(current.zoom) : next));
      const scale = zoom / current.zoom;
      return { zoom, x: bound(current.x * scale + point.x * (1 - scale), Math.max(0, (natural.width * ratio * zoom - size.width) / 2)), y: bound(current.y * scale + point.y * (1 - scale), Math.max(0, (natural.height * ratio * zoom - size.height) / 2)) };
    });
  };
  const reset = () => setView({ zoom: 1, x: 0, y: 0 });
  const move = (next: number) => { reset(); drag.current = null; setDragging(false); if (next === index) return; setIndex(next); setNatural({ width: 0, height: 0 }); setFailed(false); };
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const y = scrollY, previousOverflow = document.body.style.overflow, previousPadding = document.body.style.paddingRight;
    const gutter = innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`;
    document.body.style.overflow = 'hidden';
    dialog.current!.showModal();
    return () => {
      document.body.style.overflow = previousOverflow; document.body.style.paddingRight = previousPadding;
      window.scrollTo({ top: y, behavior: 'instant' }); previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const element = stage.current!;
    // client dimensions round at Windows fractional DPI. Leave one pixel of
    // slack so fit mode never creates a spurious scrollbar.
    const measure = () => setSize({ width: Math.max(0, element.clientWidth - 1), height: Math.max(0, element.clientHeight - 1) });
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setView(current => ({ ...current, x: bound(current.x, Math.max(0, (width - size.width) / 2)), y: bound(current.y, Math.max(0, (height - size.height) / 2)) }));
  }, [width, height, size.width, size.height]);
  useEffect(() => {
    const element = stage.current!;
    const root = dialog.current!;
    const wheel = (event: WheelEvent) => {
      // Native non-passive listener prevents Chromium's Ctrl-wheel page zoom.
      if (!element.contains(event.target as Node)) { if (event.ctrlKey) event.preventDefault(); return; }
      event.preventDefault(); event.stopPropagation();
      if (!event.ctrlKey || !ratio) return;
      const rect = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoomTo(current => current * Math.exp(-Math.max(-500, Math.min(500, delta)) * .002), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
    };
    root.addEventListener('wheel', wheel, { passive: false, capture: true });
    return () => root.removeEventListener('wheel', wheel, { capture: true });
  }, [ratio, size.width, size.height, natural.width, natural.height]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest?.('.lightbox-thumbnails')) return;
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); move(index - 1); }
      if (event.key === 'ArrowRight' && index < images.length - 1) { event.preventDefault(); move(index + 1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, images.length]);
  return createPortal(<dialog ref={dialog} className="image-lightbox" aria-labelledby="image-preview-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { backdropDown.current = event.target === event.currentTarget; }}
    onClick={event => { if (event.target === event.currentTarget && backdropDown.current) onClose(); }}>
    <section className="image-lightbox-panel">
      <header className="lightbox-header"><div><h2 id="image-preview-title">{t("图片预览")}</h2><p title={t(item.label)}>{t(item.label)}</p></div><button type="button" className="lightbox-icon-button" aria-label={t("关闭图片预览")} onClick={onClose} autoFocus><X /></button></header>
      <div className="lightbox-viewer">
        <div ref={stage} className={`lightbox-stage ${dragging ? 'is-dragging' : ''}`} onPointerDown={event => {
          if (event.button !== 0 || !(event.target instanceof HTMLImageElement) || !natural.width) return;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: view.x, panY: view.y }; setDragging(true);
        }} onPointerMove={event => {
          const start = drag.current; if (!start || start.id !== event.pointerId) return;
          setView(current => ({ ...current, x: bound(start.panX + event.clientX - start.x, Math.max(0, (width - size.width) / 2)), y: bound(start.panY + event.clientY - start.y, Math.max(0, (height - size.height) / 2)) }));
        }} onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId); } }} onPointerCancel={() => { drag.current = null; setDragging(false); }} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}><div className="lightbox-image-space">
          {failed ? <p role="alert">{t("图片暂不可用，请关闭后刷新重试。")}</p> : <img key={item.src} src={item.src} alt={t(item.label)} draggable={false} style={{ width: width || undefined, height: height || undefined, transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))`, visibility: natural.width ? 'visible' : 'hidden' }} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)} />}
        </div></div>
        {images.length > 1 && <><button className="lightbox-icon-button lightbox-previous" type="button" aria-label={t("上一张图片")} disabled={index === 0} onClick={() => move(index - 1)}><ChevronLeft /></button><button className="lightbox-icon-button lightbox-next" type="button" aria-label={t("下一张图片")} disabled={index === images.length - 1} onClick={() => move(index + 1)}><ChevronRight /></button></>}
      </div>
      <footer className="lightbox-footer"><div className="lightbox-thumbnails" role="group" aria-label={t("预览图片列表")}>{images.map((image, i) => <button type="button" key={image.src} className={i === index ? 'is-selected' : ''} aria-label={ui`查看第 ${i + 1} 张图片`} aria-pressed={i === index} onClick={() => move(i)}><img src={image.src} alt="" /></button>)}</div>
        <span className="lightbox-counter" aria-live="polite">{index + 1} / {images.length}</span>
        <div className="lightbox-zoom" role="group" aria-label={t("图片缩放")}><button type="button" aria-label={t("缩小图片")} disabled={!ratio || zoom <= .5} onClick={() => zoomTo(value => value - .25)}><Minus /></button><button type="button" aria-label={t("适应窗口")} onClick={reset}>{zoom === 1 ? t("适应窗口") : `${Math.round(ratio * zoom * 100)}%`}</button><button type="button" aria-label={t("放大图片")} disabled={!ratio || zoom >= 8} onClick={() => zoomTo(value => value + .25)}><Plus /></button></div>
      </footer>
    </section>
  </dialog>, document.body);
}
