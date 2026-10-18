import { useEffect, useRef, useState } from 'react';
import { t, ui } from '../application/i18n';
import { canvasRatio, fitCanvas } from '../domain/canvasGeometry';
import { PreviewImage } from './ImageLightbox';

export function WorkspaceCanvas({ ratio, size, src, alt, transparent }: { ratio: string; size: string; src?: string; alt: string; transparent: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setSpace({ width: rect.width, height: rect.height });
    });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const fitted = fitCanvas(canvasRatio(ratio), space.width, space.height);
  return <section className="workspace-canvas" aria-label={t('作品画布')}>
    <div className="canvas-stage" ref={host}>
      <div className={`canvas-frame${transparent ? ' is-transparent-target' : ''}`} data-ratio={ratio} style={{ width: fitted.width, height: fitted.height, aspectRatio: String(canvasRatio(ratio)) }}>
        {src && !failed ? <PreviewImage src={src} alt={alt} onError={() => setFailed(true)} /> : <div className="canvas-empty"><p>{t(failed ? '图片暂不可用' : '画布预览')}</p><span>{t('添加参考图，或发送到 Codex 生成')}</span></div>}
      </div>
    </div>
    <p className="canvas-caption">{ui`目标画布：${ratio} · ${size}`}</p>
    <p className="canvas-note">{t('预览保持原图比例；改变画布不会拉伸或重新生成图片。实际输出尺寸以生成结果为准。')}</p>
  </section>;
}
