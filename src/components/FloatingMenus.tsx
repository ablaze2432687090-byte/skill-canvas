import {useEffect} from 'react';
export function FloatingMenus(){
 useEffect(()=>{
  const position=()=>document.querySelectorAll<HTMLDetailsElement>('.project-menu[open],.project-group-bar details[open]').forEach(menu=>{
   const anchor=menu.querySelector('summary')?.getBoundingClientRect(),panel=menu.querySelector<HTMLElement>('.project-menu-panel,.project-group-editor');if(!anchor||!panel)return;
   if(anchor.bottom<0||anchor.top>innerHeight){menu.open=false;return;}
   panel.style.position='fixed';panel.style.right='auto';panel.style.maxHeight=`${innerHeight-32}px`;panel.style.overflowY='auto';panel.style.maxWidth=`${innerWidth-32}px`;
   const rect=panel.getBoundingClientRect();panel.style.left=`${Math.max(16,Math.min(innerWidth-rect.width-16,anchor.right-rect.width))}px`;
   panel.style.top=`${Math.max(16,Math.min(innerHeight-rect.height-16,anchor.bottom+rect.height+8>innerHeight?anchor.top-rect.height-8:anchor.bottom+8))}px`;
  });
  const toggle=()=>requestAnimationFrame(position);
  const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;const menus=document.querySelectorAll<HTMLDetailsElement>('.project-menu[open],.project-group-bar details[open]');if(menus.length){event.preventDefault();menus.forEach(menu=>{menu.open=false;menu.querySelector<HTMLElement>('summary')?.focus();});}};
  document.addEventListener('toggle',toggle,true);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);window.addEventListener('keydown',escape,true);
  return()=>{document.removeEventListener('toggle',toggle,true);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);window.removeEventListener('keydown',escape,true);};
 },[]);return null;
}
