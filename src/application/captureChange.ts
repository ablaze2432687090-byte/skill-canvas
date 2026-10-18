import type {ChangeEvent} from 'react';
interface FieldSnapshot {target:{value:string;checked:boolean;selectedOptions:HTMLOptionElement[]}}
/** Async saves must not reread a controlled DOM element after React restores it. */
export function captureChange(handler:(event:FieldSnapshot)=>unknown){
 return (event:ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>{
  const target=event.target;
  void handler({target:{value:target.value,checked:'checked' in target&&target.checked,selectedOptions:'selectedOptions' in target?Array.from(target.selectedOptions):[]}});
 };
}
