import {test,expect} from '@playwright/test';
test('keyboard search and settings shortcuts match actual page controls',async({page})=>{
 await page.goto('/skills');await expect(page.locator('.search-input input')).toBeVisible();await page.keyboard.press('Control+k');await expect(page.locator('.search-input input')).toBeFocused();await page.keyboard.press('Control+,');await expect(page).toHaveURL(/\/settings$/);await page.goto('/projects');await expect(page.locator('.project-library-toolbar input').first()).toBeVisible();await page.keyboard.press('Control+k');await expect(page.locator('.project-library-toolbar input').first()).toBeFocused();
});

test('parameter presets and prompt templates persist and append without overwriting text',async({page})=>{
 await page.goto('/skills/paper-signal');await page.getByRole('button',{name:'使用此 Skill',exact:true}).click();await page.getByLabel('提示词',{exact:true}).fill('Original text');await page.getByText('常用预设与文本',{exact:true}).click();
 await page.getByLabel('预设或模板名称',{exact:true}).fill('Studio');await page.getByRole('button',{name:'保存当前参数',exact:true}).click();await expect(page.getByLabel('参数预设',{exact:true}).locator('option')).toHaveCount(2);
 await page.getByRole('button',{name:'保存当前文本',exact:true}).click();await expect(page.getByLabel('提示词模板',{exact:true}).locator('option')).toHaveCount(2);
 await page.getByLabel('提示词',{exact:true}).fill('New text');await page.getByLabel('提示词模板',{exact:true}).selectOption({label:'Studio'});await page.getByRole('button',{name:'插入模板',exact:true}).click();await expect(page.getByLabel('提示词',{exact:true})).toHaveValue('New text\n\nOriginal text');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
 await page.reload();await page.getByText('常用预设与文本',{exact:true}).click();await expect(page.getByLabel('参数预设',{exact:true}).locator('option')).toHaveCount(2);await expect(page.getByLabel('提示词',{exact:true})).toHaveValue('New text\n\nOriginal text');
});

test('cache namespaces migrate legacy assets once and never mix datasets',async({page})=>{
 await page.goto('/artwork/empty.svg');
 const result=await page.evaluate(`(async()=>{const {IndexedDbStorage}=await import('/src/adapters/indexedDbStorage.ts');const store=new IndexedDbStorage();await store.set('app-state',{legacy:true});await store.set('asset:test',new Blob(['original']));const a=crypto.randomUUID(),b=crypto.randomUUID();await store.useNamespace(a,true);const original=await store.get('app-state'),blob=await store.get('asset:test');await store.useNamespace(b,false);const empty=await store.get('app-state');await store.set('app-state',{second:true});await store.useNamespace(a,true);return {original,text:await blob.text(),empty:empty===undefined,restored:await store.get('app-state'),keys:(await store.entries('asset:')).map(x=>x[0])};})()`);
 expect(result).toEqual({original:{legacy:true},text:'original',empty:true,restored:{legacy:true},keys:['asset:test']});
});

test('1000 projects and 500 Skills remain searchable, paged and within the desktop viewport',async({page})=>{
 test.setTimeout(60000);await page.goto('/skills/paper-signal');await page.getByRole('button',{name:'使用此 Skill',exact:true}).click();await page.getByLabel('提示词',{exact:true}).fill('Stress fixture');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
 await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('skill-canvas-local');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const state=await new Promise<any>(resolve=>{const r=db.transaction('records').objectStore('records').get('app-state');r.onsuccess=()=>resolve(r.result);});const sample=state.projects[0],manifest=state.manifests[0];state.projects=Array.from({length:1000},(_,i)=>({...structuredClone(sample),id:crypto.randomUUID(),title:'Project '+i,updatedAt:new Date(Date.now()-i*1000).toISOString()}));state.activeProjectId=null;state.manifests=Array.from({length:500},(_,i)=>{const value=structuredClone(manifest);value.id='stress-'+i;value.installation.id=value.id;value.name='Skill '+i;return value;});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(state,'app-state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();});
 await page.goto('/projects');await expect(page.locator('.project-card')).toHaveCount(60);await page.getByRole('button',{name:'加载更多作品',exact:true}).click();await expect(page.locator('.project-card')).toHaveCount(120);await page.getByLabel('搜索创作',{exact:true}).fill('Project 999');await expect(page.locator('.project-card')).toHaveCount(1);
 await page.goto('/skills');await expect(page.locator('.skill-card')).toHaveCount(60);await page.setViewportSize({width:1280,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('system appearance tracks OS changes, text size persists without scaling images',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await page.goto('/settings');await page.getByRole('button',{name:'系统',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.getByLabel('文字大小',{exact:true}).selectOption('125');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');await page.reload();await expect(page.getByLabel('文字大小',{exact:true})).toHaveValue('125');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
