import {test,expect} from '@playwright/test';
import {presentationManifest,presentationProject} from './fixtures/presentation';
import {defaultSettings} from '../src/domain/skill';
import type {SkillManifest} from '../src/domain/skill';
import type {CanvasProject} from '../src/domain/types';

async function seed(page:import('@playwright/test').Page,manifest:SkillManifest,project?:CanvasProject){
 await page.goto('/settings');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
 await page.evaluate(state=>new Promise<void>((resolve,reject)=>{const r=indexedDB.open('skill-canvas-local');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put(state,'app-state');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{schema:2,settings:{...defaultSettings,codexMode:'mock',showDemoSkills:false},manifests:[manifest],projects:project?[project]:[],activeProjectId:project?.id||null});
}
test('a failed real-task fixture shows a failed heading, never a generating heading',async({page})=>{
 const manifest=presentationManifest(),project=presentationProject(manifest);project.status='failed';project.generations[0].status='failed';project.generations[0].codex!.stage='failed';await seed(page,manifest,project);await page.goto('/task/'+project.generations[0].id);await expect(page.getByRole('heading',{name:'任务生成失败'})).toBeVisible();await expect(page.locator('.execution-steps .is-stopped')).toHaveCount(1);
});
test('mandatory references and configuration entry follow actual Skill requirements',async({page})=>{
 const manifest=presentationManifest('Required Visual','required-skill');manifest.runtime.status='needs_configuration';await seed(page,manifest);await page.goto('/skills/'+manifest.id);await page.getByRole('button',{name:'前往配置'}).click();await expect(page).toHaveURL(/\/manage\?tab=configuration$/);
 manifest.runtime.status='ready';manifest.inputs.push({id:'photo',type:'image',label:'Photo',required:true});await seed(page,manifest);await page.goto('/skills/'+manifest.id);await page.getByRole('button',{name:'使用此 Skill'}).click();await expect(page.locator('.workspace-input')).toContainText('参考图（必需）');
});
test('application confirmation is modal, cancellable with Escape and never deletes on cancel',async({page})=>{
 await page.goto('/skills/paper-signal');await page.getByRole('button',{name:'使用此 Skill'}).click();await page.getByLabel('提示词',{exact:true}).fill('Modal test');await page.getByRole('link',{name:'我的创作',exact:true}).click();
 const card=page.locator('.project-card').first();await card.locator('.project-menu summary').click();await card.getByRole('button',{name:/删除项目/}).click();
 const dialog=page.locator('.app-dialog');await expect(dialog).toBeVisible();await expect(dialog).toContainText('不可恢复');
 for(let i=0;i<6;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(card).toBeVisible();
 await card.getByRole('button',{name:'名称、分组与标签'}).click();const editor=page.locator('.project-dialog');await expect(editor).toBeVisible();for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await editor.evaluate(node=>node.contains(document.activeElement))).toBe(true);}await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);
});
for(const [width,theme,language]of [[1920,'dark','zh-CN'],[1280,'light','en'],[960,'light','zh-CN']]as const){
 test(`all page surfaces remain orderly at ${width}px ${theme} ${language}`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.addInitScript(language=>localStorage.setItem('skill-canvas-language',language),language);
  await page.goto('/settings');await page.locator('.theme-options button').nth(theme==='light'?0:1).click();await page.locator('#text-scale').selectOption('125');
  const routes=['/','/skills','/skills/paper-signal','/create','/projects','/manage','/settings'];
  for(const route of routes){await page.goto(route);await expect(page.locator('main')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`work/ui-062/${width}-${route.replaceAll('/','-')||'home'}.png`});}
 });
}
test('system theme description matches system mode instead of hard-coding dark',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await page.goto('/settings');await page.getByRole('button',{name:'系统',exact:true}).click();await expect(page.locator('.settings-page')).toContainText('系统 · 常规');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('.settings-page')).toContainText('系统 · 夜间');
});
