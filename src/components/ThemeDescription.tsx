import {useEffect,useState} from 'react';
import {t} from '../application/i18n';
export function ThemeDescription({theme}:{theme:string}){const [light,setLight]=useState(()=>matchMedia('(prefers-color-scheme:light)').matches);useEffect(()=>{const media=matchMedia('(prefers-color-scheme:light)'),change=()=>setLight(media.matches);change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);return <>{theme==='system'?`${t('系统')} · ${t(light?'常规':'夜间')}`:t(theme==='gold'?'黑金':theme==='light'?'常规':'夜间')}</>;}
