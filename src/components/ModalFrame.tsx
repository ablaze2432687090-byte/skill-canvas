import {useEffect,useRef,type ReactNode} from 'react';
import {trapDialogFocus} from '../application/dialogFocus';
/** Native modal semantics supply focus containment, background inertness and focus return. */
export function ModalFrame({children,label,className,onClose}:{children:ReactNode;label:string;className?:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 return <dialog ref={dialog} aria-label={label} className={className} onKeyDown={trapDialogFocus} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}}>{children}</dialog>;
}
