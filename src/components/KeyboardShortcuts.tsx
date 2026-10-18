import {useEffect} from 'react';
import {t} from '../application/i18n';
import {navigate} from '../application/router';
export function KeyboardBindings(){
 useEffect(()=>{const keydown=(event:KeyboardEvent)=>{
  if(event.defaultPrevented||event.repeat||event.isComposing||event.altKey||event.shiftKey||!event.ctrlKey&&!event.metaKey||document.querySelector('dialog[open],[aria-modal="true"]'))return;
  if(event.key===','){event.preventDefault();navigate('/settings');}
  if(event.key.toLowerCase()==='k'){
   const search=document.querySelector<HTMLInputElement>('.search-input input,.project-library-toolbar input,input[type="search"]');
   if(search){event.preventDefault();search.focus();search.select();}
  }
 };window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[]);return null;
}
export function KeyboardHelp(){return <section className="settings-section"><h2>{t('键盘与显示')}</h2><dl className="skill-source-metadata"><div><dt>Ctrl / ⌘ + K</dt><dd>{t('聚焦当前页面搜索')}</dd></div><div><dt>Ctrl / ⌘ + ,</dt><dd>{t('打开设置')}</dd></div><div><dt>Esc</dt><dd>{t('先关闭浮窗或菜单，再返回上一级')}</dd></div><div><dt>Ctrl + {t('鼠标滚轮')}</dt><dd>{t('仅在图片浮窗内缩放图片')}</dd></div><div><dt>Tab / Shift + Tab</dt><dd>{t('切换键盘焦点')}</dd></div></dl></section>;}
