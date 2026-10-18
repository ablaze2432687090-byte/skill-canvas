import {test,expect,type Page} from '@playwright/test';
test('设置为不可折叠分区，中英文与三种主题均适配',async({page})=>{
 test.setTimeout(90000);await page.goto('/settings');
 await expect(page.locator('.settings-page details,.settings-page summary')).toHaveCount(0);
 for(const title of ['管理主分类','管理 Skill 分组','首页与默认偏好','高级连接信息','键盘与显示']){await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();}
 await page.getByRole('heading',{name:'管理主分类',exact:true}).click();await expect(page.getByLabel('中文分类名',{exact:true})).toBeVisible();
 for(const language of ['zh','en']){
  await page.getByRole('button',{name:language==='en'?'English':'简体中文',exact:true}).click();
  for(const [theme,zh,en]of [['light','常规','Light'],['dark','夜间','Dark'],['gold','黑金','Gold']]){
   await page.getByRole('button',{name:language==='en'?en:zh,exact:true}).click();
   for(const width of [960,1280,1920]){
    await page.setViewportSize({width,height:1000});
    await page.locator('#text-scale').selectOption('125');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const overflows=await page.locator('.settings-page input,.settings-page select,.settings-page button').evaluateAll(nodes=>nodes.filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<0);}).map(node=>node.outerHTML.slice(0,160)));
    expect(overflows).toEqual([]);
    const panel=page.locator('.settings-page > .settings-section').first();expect(await panel.evaluate(e=>getComputedStyle(e).borderRadius)).toBe('16px');
    if(width===1280){await page.screenshot({path:'work/settings-panels/'+language+'-'+theme+'.png',fullPage:true});await page.locator('.personalization-settings').screenshot({path:'work/settings-panels/'+language+'-'+theme+'-personalization.png'});await page.locator('.appearance-settings').screenshot({path:'work/settings-panels/'+language+'-'+theme+'-appearance.png'});}
   }
  }
 }
 await page.getByRole('button',{name:'简体中文',exact:true}).click();await page.getByRole('button',{name:'系统',exact:true}).click();await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.reload();await expect(page.locator('.settings-page details')).toHaveCount(0);
});

test('首页偏好勾选与排序可持久化，选择器留出箭头空间',async({page})=>{
 await page.goto('/settings');const picker=page.locator('.home-category-picker');await expect(picker.locator('select[multiple]')).toHaveCount(0);
 const first=picker.getByRole('checkbox').first(),original=await first.isChecked();await first.setChecked(!original);await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');await page.reload();await expect(picker.getByRole('checkbox').first()).toBeChecked({checked:!original});
 const rows=page.locator('.home-module-row'),secondName=await rows.nth(1).locator('span').nth(1).textContent();await rows.nth(1).getByRole('button').click();await expect(rows.first()).toContainText(secondName!);await page.reload();await expect(rows.first()).toContainText(secondName!);
 expect(await page.getByLabel('Skill 库视图',{exact:true}).evaluate(e=>getComputedStyle(e).paddingRight)).toBe('44px');
 const modes=page.locator('.language-mode-options');const widths=await modes.getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));expect(Math.abs(widths[0]-widths[1])).toBeLessThan(2);expect((await modes.boundingBox())!.width).toBeLessThan(400);
});

test('主题名称与顺序在中英文下保持一致',async({page})=>{
 await page.goto('/settings');const buttons=page.getByRole('group',{name:'界面模式'}).getByRole('button');await expect(buttons).toHaveText(['常规','夜间','黑金','系统']);
 await page.getByRole('button',{name:'English',exact:true}).click();await expect(page.getByRole('group',{name:'Color mode',exact:true}).getByRole('button')).toHaveText(['Light','Dark','Gold','System']);
});
test('黑金全局切换、持久化、图片原色与响应式设置',async({page})=>{
 await page.goto('/settings');await page.getByRole('button',{name:'黑金',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','gold');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
 for(const route of ['/','/skills','/skills/paper-signal','/create','/projects','/manage','/settings']){
  await page.goto(route);await expect(page.locator('html')).toHaveAttribute('data-theme','gold');expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(36, 35, 33)');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','gold');
 for(const width of [960,1280,1920]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('button',{name:'黑金',exact:true})).toBeVisible();}
 await page.screenshot({path:'work/theme/gold-settings.png'});
 await page.goto('/skills/paper-signal');await page.locator('.featured-example img').click();const dialog=page.getByRole('dialog',{name:'图片预览'});await expect(dialog).toBeVisible();expect(await dialog.locator('.lightbox-image-space img').evaluate(e=>getComputedStyle(e).filter)).toBe('none');await page.keyboard.press('Escape');
 await page.goto('/');await page.screenshot({path:'work/theme/gold-home.png'});
 await page.goto('/settings');await page.getByRole('button',{name:'常规',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});
async function light(page:Page){await page.goto('/settings');await page.getByRole('button',{name:'常规',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');}
async function assertLight(page:Page){await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(250, 250, 251)');expect(await page.locator('body').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(29, 29, 31)');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test('外观位于设置最前，全页面同步并在重载后保留，主页没有开关',async({page})=>{
 await page.goto('/settings');await expect(page.getByRole('button',{name:'夜间',exact:true})).toHaveAttribute('aria-pressed','true');expect((await page.getByRole('heading',{name:'外观',exact:true}).boundingBox())!.y).toBeLessThan(350);await light(page);
 for(const route of ['/','/skills','/skills/paper-signal','/create','/projects','/manage','/settings','/missing-route']){await page.goto(route);await assertLight(page);if(route!=='/settings')await expect(page.getByRole('group',{name:'界面模式'})).toHaveCount(0);}
 await page.goto('/settings');await page.getByRole('button',{name:'夜间',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(16, 17, 18)');
});
test('图片浮窗与控件跟随常规，图片不加滤镜且保持原有缩放交互',async({page})=>{
 await light(page);await page.goto('/skills/paper-signal');const image=page.locator('.featured-example img');await expect.poll(()=>image.evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBeGreaterThan(0);const src=await image.evaluate((i:HTMLImageElement)=>i.src);await image.click();const dialog=page.getByRole('dialog',{name:'图片预览'});await expect(dialog).toBeVisible();expect(await dialog.locator('.image-lightbox-panel').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');expect(await dialog.locator('.lightbox-image-space img').evaluate(e=>getComputedStyle(e).filter)).toBe('none');expect(await dialog.locator('.lightbox-image-space img').getAttribute('src')).toBe(src);await dialog.getByRole('button',{name:'放大图片',exact:true}).click();await expect(dialog.locator('.lightbox-counter')).toHaveText('1 / 2');await page.screenshot({path:'work/theme/light-image-viewer.png'});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('工作台、执行、结果、项目菜单与编辑弹窗均使用常规',async({page})=>{
 await light(page);await page.goto('/create');await assertLight(page);await page.getByLabel('提示词',{exact:true}).fill('Theme interface test only');expect(await page.getByLabel('提示词',{exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');await page.getByRole('button',{name:'在 Codex 中生成',exact:true}).click();await expect(page).toHaveURL(/\/task\/mock-/);await assertLight(page);await page.getByRole('button',{name:'完成模拟并查看结果'}).click();await expect(page).toHaveURL(/\/result\/mock-/);await assertLight(page);await page.getByRole('link',{name:'我的创作',exact:true}).click();const card=page.locator('.project-card').first();await card.locator('summary').click();await card.getByRole('button',{name:'名称、分组与标签'}).click();await expect(page.locator('.project-dialog')).toBeVisible();expect(await page.locator('.project-dialog').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');await page.screenshot({path:'work/theme/light-project-dialog.png'});
});
