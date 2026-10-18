import {captureChange} from '../application/captureChange';
import {useState} from 'react';
import {useCanvas} from '../application/CanvasProvider';
import {t} from '../application/i18n';
export function GalleryPreferences(){
 const {personal,savePersonal}=useCanvas(),[error,setError]=useState('');
 return <details className="gallery-display-options"><summary>{t('显示选项')}</summary><div className="settings-actions gallery-preferences"><label>{t('图库视图')}<select aria-label={t('图库视图')} value={personal.gallery.view} onChange={captureChange(event=>void savePersonal(p=>({...p,gallery:{...p.gallery,view:event.target.value as 'grid'|'list'}})).catch(e=>setError(e.message)))}><option value="grid">{t('网格')}</option><option value="list">{t('列表')}</option></select></label><label>{t('卡片密度')}<select aria-label={t('创作卡片密度')} value={personal.gallery.density} onChange={captureChange(event=>void savePersonal(p=>({...p,gallery:{...p.gallery,density:event.target.value as 'compact'|'standard'|'comfortable'}})).catch(e=>setError(e.message)))}>{['compact','standard','comfortable'].map((density,index)=><option key={density} value={density}>{t(['紧凑','标准','舒适'][index])}</option>)}</select></label>{error&&<p role="alert" className="field-error">{t(error)}</p>}</div></details>;
}
