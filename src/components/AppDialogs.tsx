import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {t} from '../application/i18n';
import {trapDialogFocus} from '../application/dialogFocus';
type Request={id:number;message:string;kind:'confirm'|'text';initial:string;resolve:(value:string|boolean|null)=>void};
const queue:Request[]=[],listeners=new Set<()=>void>();let serial=0;
const notify=()=>listeners.forEach(listener=>listener());
function request(message:string,kind:Request['kind'],initial=''){return new Promise<string|boolean|null>(resolve=>{queue.push({id:++serial,message,kind,initial,resolve});notify();});}
export async function confirmAction(message:string){return await request(message,'confirm')===true;}
export async function askText(message:string,initial=''){const result=await request(message,'text',initial);return typeof result==='string'?result:null;}
function finish(value:string|boolean|null){queue.shift()?.resolve(value);notify();}
function Dialog({request}:{request:Request}){
 const dialog=useRef<HTMLDialogElement>(null),[value,setValue]=useState(request.initial);const danger=request.kind==='confirm'&&/删除|移除|清理|delete|remove|clean/i.test(request.message);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 return createPortal(<dialog ref={dialog} className="app-dialog" aria-labelledby="app-dialog-title" onKeyDown={trapDialogFocus} onCancel={event=>{event.preventDefault();finish(null);}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)finish(null);}}}><form onSubmit={event=>{event.preventDefault();finish(request.kind==='text'?value:true);}}>
  <h2 id="app-dialog-title">{t(request.kind==='text'?'输入名称':'确认操作')}</h2><p>{request.message}</p>
  {request.kind==='text'&&<input aria-label={request.message} autoFocus maxLength={120} value={value} onChange={event=>setValue(event.target.value)}/>}
  <div className="app-dialog-actions"><button type="button" className="button button-secondary" autoFocus={request.kind==='confirm'} onClick={()=>finish(null)}>{t('取消')}</button><button type="submit" disabled={request.kind==='text'&&!value.trim()} className={`button ${danger?'button-danger':'button-primary'}`}>{t('确认')}</button></div>
 </form></dialog>,document.body);
}
export function AppDialogHost(){const current=useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>queue[0]||null);return current?<Dialog key={current.id} request={current}/>:null;}
