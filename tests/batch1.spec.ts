import {test,expect} from '@playwright/test';

test('long creative briefs and reference paste/drop share bounded upload validation',async({page})=>{
 await page.goto('/create');
 const prompt=page.getByLabel('提示词',{exact:true});await prompt.fill('A'.repeat(1200));await expect(prompt).toHaveValue('A'.repeat(1200));await expect(prompt).toHaveAttribute('maxlength','8000');
 const area=page.getByLabel('参考图上传区域');await expect(area).toBeVisible();
 await area.evaluate(element=>{const transfer=new DataTransfer();transfer.items.add(new File(['invalid'],'readme.txt',{type:'text/plain'}));element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));});
 await expect(page.getByRole('alert')).toContainText('PNG、JPG 或 WEBP');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('native onboarding can resume and diagnostics are shown without an automatic paid probe',async({page})=>{
 await page.addInitScript(()=>{
  const current={status:'no_release',manual:true,currentVersion:'1.3.1',message:'官方仓库尚无正式发布版本，可打开发布页查看预览版。'};
  const noop=async()=>true;
  Object.assign(window,{skillCanvasDesktop:{info:async()=>({onboardingComplete:false,language:'zh-CN',theme:'dark'}),setupStep:async()=>Number(localStorage.getItem('test-step')||0),saveSetupStep:async(step:number)=>{localStorage.setItem('test-step',String(step));return true;},completeSetup:noop,setLanguage:async(language:string)=>language,environment:async()=>({codexPath:'codex.exe',status:{connected:false,authenticated:false},capabilities:{automaticImageGeneration:false}}),imageProbeState:async()=>({status:'idle',message:''}),onBeforeClose:()=>()=>{},onService:()=>()=>{},onUpdate:()=>()=>{},updateState:async()=>current,checkUpdates:async()=>current,diagnostics:async()=>({schema:1,redacted:true}),copyDiagnostics:async()=>({schema:1,redacted:true}),reveal:noop}});
 });
 await page.goto('/settings');
 const dialog=page.getByRole('dialog',{name:'准备好你的创作环境'});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'下一步',exact:true}).click();await expect(dialog.getByRole('heading',{name:'使用准备',exact:true})).toBeVisible();await expect(dialog.getByText('尚未验证，不代表不可用')).toBeVisible();
 await page.reload();await expect(dialog.getByRole('heading',{name:'使用准备',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'进入 Skill Canvas',exact:true}).click();await page.getByRole('button',{name:'查看诊断',exact:true}).click();await expect(page.locator('.diagnostic-report')).toContainText('"redacted": true');await page.getByRole('button',{name:'重新打开使用引导'}).click();await expect(dialog).toBeVisible();
});
