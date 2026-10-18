import {expect,type Page} from '@playwright/test';
type Dialog={message:()=>string;accept:(value?:string)=>Promise<void>;dismiss:()=>Promise<void>};
async function install(page:Page,handler:(dialog:Dialog)=>unknown,once:boolean){
 await page.addLocatorHandler(page.locator('.app-dialog[open]'),async dialog=>{
  const message=await dialog.locator('p').innerText();await handler({message:()=>message,accept:async(value)=>{if(value!==undefined)await dialog.locator('input').fill(value);await dialog.getByRole('button',{name:/^(确认|Confirm)$/}).click();},dismiss:async()=>{await dialog.getByRole('button',{name:/^(取消|Cancel)$/}).click();}});await expect(dialog).not.toBeVisible();
 },once?{times:1}:{});
}
export const handleDialog=(page:Page,handler:(dialog:Dialog)=>unknown)=>install(page,handler,true);
export const handleDialogs=(page:Page,handler:(dialog:Dialog)=>unknown)=>install(page,handler,false);
