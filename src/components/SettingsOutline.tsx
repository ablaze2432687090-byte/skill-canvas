import {useEffect} from 'react';
import {t} from '../application/i18n';
const groups=[['appearance','外观'],['language','语言'],['personalization','个人整理与显示'],['environment','使用准备'],['updates','应用与更新'],['backup','数据备份与恢复'],['storage','存储与安全清理']];
export function SettingsOutline(){
 useEffect(()=>{const assign=()=>{for(const [id,title]of groups){const heading=[...document.querySelectorAll('.settings-page h2')].find(node=>node.textContent===t(title));const section=heading?.closest('section');if(section)section.id='settings-'+id;}};assign();const observer=new MutationObserver(assign);const page=document.querySelector('.settings-page');if(page)observer.observe(page,{childList:true,subtree:true,characterData:true});return()=>observer.disconnect();},[]);
 return <nav className="settings-outline" aria-label={t('设置页内导航')}>{groups.map(([id,label])=><a key={id} href={'#settings-'+id} onClick={event=>{event.preventDefault();const section=document.getElementById('settings-'+id);section?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}}>{t(label)}</a>)}</nav>;
}
