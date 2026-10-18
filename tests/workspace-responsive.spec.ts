import {test,expect} from '@playwright/test';
import path from 'node:path';

for(const [width,theme,language,scale] of [[1920,'dark','zh-CN',100],[1440,'light','en',125],[1280,'light','zh-CN',125],[1024,'dark','en',125],[800,'light','zh-CN',125]] as const){
 test(`workspace and settings adapt at ${width}px ${theme} ${language} ${scale}%`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.addInitScript(({language})=>{localStorage.setItem('skill-canvas-language',language);},{language});
  await page.goto('/settings');
  await page.locator('.theme-options button').nth(theme==='light'?0:1).click();
  await page.locator('#text-scale').selectOption(String(scale));
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('.save-indicator')).toHaveText(/已保存到本地|Saved locally/);
  await expect(page.locator('#text-scale')).toBeVisible();
  const box=await page.locator('#text-scale').boundingBox();expect(box!.width).toBeGreaterThanOrEqual(140);expect(box!.height).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`work/ui-061/settings-${width}.png`});
  await page.goto('/skills/paper-signal');await page.getByRole('button',{name:/使用此 Skill|Use this Skill/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('.canvas-frame')).toBeVisible();
  await page.getByRole('group',{name:/输出比例|Aspect ratio/}).getByRole('button',{name:'1:1',exact:true}).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-ratio','1:1');
  let frame=await page.locator('.canvas-frame').boundingBox();expect(Math.abs(frame!.width/frame!.height-1)).toBeLessThan(.02);
  await page.getByRole('group',{name:/输出比例|Aspect ratio/}).getByRole('button',{name:'9:16',exact:true}).click();
  frame=await page.locator('.canvas-frame').boundingBox();expect(Math.abs(frame!.width/frame!.height-9/16)).toBeLessThan(.02);
  await expect(page.locator('.generation-summary')).toContainText('720 × 1280');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const overlapping=await page.locator('.workspace-parameters select,.workspace-parameters .segmented button').evaluateAll(elements=>{
    const floating=document.querySelector('.floating-page-actions')!.getBoundingClientRect();
    return elements.some(element=>{const r=element.getBoundingClientRect();return r.right>innerWidth||r.left<0||(r.right>floating.left&&r.left<floating.right&&r.bottom>floating.top&&r.top<floating.bottom);});
  });expect(overlapping).toBe(false);
  await page.screenshot({path:`work/ui-061/workspace-${width}.png`});
  await page.getByRole('button',{name:/恢复 Skill 默认值|Reset Skill defaults/}).click();
  await expect(page.locator('.canvas-frame')).toHaveAttribute('data-ratio','4:5');
  await expect(page.locator('.save-indicator')).toHaveText(/已保存到本地|Saved locally/);
  await page.reload();await expect(page.locator('.canvas-frame')).toHaveAttribute('data-ratio','4:5');
 });
}
test('reference preview, replacement and role persist without stretching',async({page})=>{
 await page.goto('/skills/paper-signal');await page.getByRole('button',{name:'使用此 Skill'}).click();
 await page.getByLabel('添加参考图',{exact:true}).setInputFiles('public/artwork/category-photo.png');
 await page.getByLabel('category-photo.png 的角色').selectOption('subject_reference');
 await page.getByRole('button',{name:'放大查看：category-photo.png'}).click();await expect(page.locator('.image-lightbox')).toBeVisible();await page.keyboard.press('Escape');
 await page.getByLabel('更换参考图：category-photo.png',{exact:true}).setInputFiles('public/artwork/category-cover.png');
 await expect(page.getByLabel('category-cover.png 的角色')).toHaveValue('subject_reference');await expect(page.locator('.reference-entry')).toHaveCount(1);
 await page.reload();await expect(page.getByLabel('category-cover.png 的角色')).toHaveValue('subject_reference');
});

test('imagegen exposes eight ratios, sizes, counts and collapsible creative instructions',async({page})=>{
 await page.goto('/settings');await page.getByLabel('导入 Skill 目录',{exact:true}).setInputFiles(path.resolve('tests/fixtures/workspace'));
 await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
 await page.goto('/skills');await page.getByRole('link',{name:'查看 imagegen 详情',exact:true}).click();await page.getByRole('button',{name:'使用此 Skill'}).click();
 const ratio=page.getByLabel('画面比例',{exact:true});await expect(ratio.locator('option')).toHaveCount(8);
 await ratio.selectOption('3:4');await expect(page.locator('.canvas-frame')).toHaveAttribute('data-ratio','3:4');
 await page.getByLabel('目标尺寸',{exact:true}).selectOption('1536 × 2048');
 await page.getByRole('group',{name:'图片数量',exact:true}).getByRole('button',{name:'4',exact:true}).click();
 await expect(page.locator('.generation-summary')).toContainText('1536 × 2048 · 4 张');
 await page.getByText('更多设置',{exact:true}).click();await page.getByLabel('保真要求（指令）',{exact:true}).selectOption('保留原始构图');
 await page.getByRole('group',{name:'背景',exact:true}).getByRole('button',{name:'透明背景'}).click();
 await expect(page.locator('.canvas-frame')).toHaveClass(/is-transparent-target/);
 await page.getByLabel('提示词',{exact:true}).fill('Test creative brief');await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
 await page.reload();await expect(page.getByLabel('目标尺寸',{exact:true})).toHaveValue('1536 × 2048');
 await page.getByRole('button',{name:'恢复 Skill 默认值'}).click();await expect(ratio).toHaveValue('1:1');
 await expect(page.getByLabel('提示词',{exact:true})).toHaveValue('Test creative brief');
});
