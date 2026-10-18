import { t, ui } from '../application/i18n';
import { Plus, X, RefreshCw } from 'lucide-react';
import { ImageLightbox } from './ImageLightbox';
import { useState } from 'react';
import type { ReferenceImage, ReferenceRole } from '../domain/types';
import { useCanvas } from '../application/CanvasProvider';
import { Thumbnail } from './primitives';

export function ReferenceImages({ images, onChange,onPreview }: { images: ReferenceImage[]; onChange: (images: ReferenceImage[]) => void;onPreview?:(id:string)=>void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const { addReferences } = useCanvas();
  const add=async(files:File[], replaceId?:string)=>{
    if(busy||!files.length)return;setBusy(true);setError('');
    try{if(files.length+images.length-(replaceId?1:0)>6)throw new Error('最多添加 6 张参考图。');await addReferences(files,replaceId);}
    catch(failure){setError(failure instanceof Error?failure.message:'参考图读取失败，请重试。');}
    finally{setBusy(false);}
  };
  const roles: [ReferenceRole, string][] = [['edit_target', '编辑对象'], ['style_reference', '风格参考'], ['subject_reference', '主体参考'], ['composition_reference', '构图参考'], ['brand_asset', '品牌素材']];
  return <div className="reference-area" tabIndex={0} aria-label={t('参考图上传区域')} aria-busy={busy} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=busy?'none':'copy';}} onDrop={event=>{event.preventDefault();void add(Array.from(event.dataTransfer.files));}} onPaste={event=>{const files=Array.from(event.clipboardData.files);if(files.length){event.preventDefault();void add(files);}}}><p className="settings-hint">{t('可拖放图片，或点击此区域后粘贴。最多 6 张，每张不超过 8 MB。')}</p><div className="reference-grid">
    {images.map(image => <div key={image.id} className="reference-entry"><div className="reference-image"><Thumbnail image={image.url} alt={image.name} empty={t("参考图不可用")} /><button className="reference-preview" type="button" disabled={!image.url} aria-label={ui`放大查看：${image.name}`} onClick={() => {onPreview?.(image.id);setPreview(image.id);}} /><button className="reference-remove" type="button" disabled={busy} aria-label={ui`移除${image.name}`} onClick={() => onChange(images.filter(item => item.id !== image.id))}><X size={14} /></button></div><select disabled={busy} aria-label={ui`${image.name} 的角色`} value={image.role || 'style_reference'} onChange={event => onChange(images.map(item => item.id === image.id ? { ...item, role: event.target.value as ReferenceRole } : item))}>{roles.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select><label className="reference-replace"><RefreshCw size={12}/>{t('更换参考图')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} aria-label={ui`更换参考图：${image.name}`} onChange={async event=>{const input=event.currentTarget;await add(Array.from(input.files||[]),image.id);input.value='';}}/></label></div>)}
    {images.length < 6 && <label className={`reference-add ${busy ? 'is-busy' : ''}`}><Plus aria-hidden="true" /><span>{busy ? t("读取中…") : t("添加参考图")}</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} aria-label={t("添加参考图")} onChange={async event => {
      const input = event.currentTarget;
      const files = Array.from(input.files || []);
      await add(files);input.value='';
    }} /></label>}
  </div>{t(error) && <p role="alert" className="field-error">{t(error)}</p>}{preview && images.some(image=>image.id===preview) && <ImageLightbox images={images.filter(image=>!!image.url).map(image=>({src:image.url,label:image.name}))} initialIndex={Math.max(0,images.filter(image=>!!image.url).findIndex(image=>image.id===preview))} onClose={()=>setPreview(null)}/>}</div>;
}
