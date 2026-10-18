import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function assertShell(page: Page) {
  const navigation = page.getByRole('navigation', { name: '主导航' });
  await expect(navigation.getByRole('link')).toHaveCount(5);
  for (const label of ['首页', 'Skill 库', '我的创作', 'Skill 管理', '设置']) await expect(navigation.getByRole('link', { name: label, exact: true })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('img').evaluateAll(elements => elements.every(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0))).toBe(true);
}

test('核心流程保留输入、参数、参考图，并支持版本、下载和继续修改', async ({ page }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5173') && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) external.push(request.url()); });
  await page.goto('/');
  await page.getByRole('link', { name: '查看 Paper Signal 详情', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paper Signal', exact: true })).toBeVisible();
  await assertShell(page);
  await page.getByRole('button', { name: '使用此 Skill' }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.getByLabel('提示词', { exact: true }).fill('中文海报测试：清晰的排版和红色几何形状');
  await page.getByLabel('具体要求（可选）').fill('保留主体，增加留白');
  await page.getByRole('group', { name: '输出比例' }).getByRole('button', { name: '3:4', exact: true }).click();
  await page.getByRole('group', { name: '输出数量' }).getByRole('button', { name: '4', exact: true }).click();
  await page.getByRole('group', { name: '输出格式' }).getByRole('button', { name: 'JPG', exact: true }).click();
  await page.getByLabel('添加参考图').setInputFiles({ name: '测试参考.png', mimeType: 'image/png', buffer: await readFile('public/artwork/category-photo.png') });
  await expect(page.getByAltText('测试参考.png')).toBeVisible();
  await page.locator('.prompt-disclosure summary').click();
  await expect(page.locator('.prompt-disclosure')).toContainText('参考图：1 张');
  await expect(page.locator('.prompt-disclosure')).toContainText('960 × 1280');
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  await expect(page).toHaveURL(/\/task\/mock-/);
  await expect(page.getByText('模拟执行，未连接 Codex', { exact: false })).toBeVisible();
  await expect(page.locator('.execution-steps li')).toHaveCount(6);
  await page.getByRole('button', { name: '完成模拟并查看结果' }).click();
  await expect(page).toHaveURL(/\/result\/mock-/);
  const resultUrl = page.url();
  await expect(page.locator('.result-prompt')).toHaveText('中文海报测试：清晰的排版和红色几何形状');
  await expect(page.locator('.result-parameters')).toContainText('3:4');
  await expect(page.getByRole('group', { name: '结果版本' }).getByRole('button')).toHaveCount(4);
  await page.getByRole('button', { name: 'V2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'V2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '对比版本', exact: true }).click();
  await expect(page.getByAltText('原图', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '版本对比', exact: true }).click();
  await expect(page.getByAltText('对比版本 V1')).toBeVisible();
  await page.getByRole('button', { name: '关闭对比' }).click();
  await page.locator('.inline-prompt summary').click();
  await expect(page.locator('.inline-prompt')).toContainText('具体要求：保留主体，增加留白');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Skill-Canvas-V2.png');
  const file = await readFile((await download.path())!);
  expect(file.subarray(1, 4).toString()).toBe('PNG');
  expect(file.readUInt32BE(16)).toBe(960);
  expect(file.readUInt32BE(20)).toBe(1280);
  await page.locator('.quick-modify summary').click();
  await page.getByLabel('继续修改要求').fill('主体向右移动');
  await page.getByRole('button', { name: '继续修改' }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByLabel('具体要求（可选）')).toHaveValue('保留主体，增加留白\n主体向右移动');
  await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  await page.reload();
  await expect(page.getByLabel('具体要求（可选）')).toHaveValue('保留主体，增加留白\n主体向右移动');
  await page.goto(resultUrl);
  await expect(page.locator('.result-prompt')).toHaveText('中文海报测试：清晰的排版和红色几何形状');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('模拟任务自动完成，离开执行页后仍能返回结果', async ({ page }) => {
  await page.goto('/create');
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  const taskUrl = page.url();
  await page.getByRole('navigation').getByRole('link', { name: '首页', exact: true }).click();
  await page.waitForTimeout(12500);
  await page.goto(taskUrl);
  await expect(page).toHaveURL(/\/result\/mock-/);
  await expect(page.getByRole('heading', { name: '作品已生成' })).toBeVisible();
});

test('取消和空提示词有明确反馈，任务不会被误标记为成功', async ({ page }) => {
  await page.goto('/create');
  await page.getByLabel('提示词', { exact: true }).fill(' ');
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('请输入提示词。');
  await expect(page).toHaveURL(/\/create$/);
  await page.getByLabel('提示词', { exact: true }).fill('取消测试');
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  const taskUrl = page.url();
  await page.getByRole('button', { name: '取消生成' }).click();
  await expect(page.getByRole('heading', { name: '模拟任务已取消' })).toBeVisible();
  await page.getByRole('button', { name: '返回工作台' }).click();
  await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('取消测试');
  await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  await page.goto(taskUrl);
  await expect(page.getByRole('heading', { name: '模拟任务已取消' })).toBeVisible();
});

test('搜索、分类、筛选、五个导航和无效路由均可用', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '海报设计', exact: true }).click();
  await expect(page.locator('.skill-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '海报设计', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '三维艺术', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.locator('.skill-card')).toHaveCount(3);
  await page.locator('.library-filter-panel > summary').click();
  await page.getByLabel('运行状态').selectOption('installed');
  await expect(page.locator('.skill-card')).toHaveCount(0);
  await page.getByLabel('运行状态').selectOption('all');
  await page.getByRole('textbox', { name: '搜索 Skill 名称…' }).fill('does-not-exist');
  await expect(page.getByRole('heading', { name: '没有匹配的 Skill' })).toBeVisible();
  for (const [label, route] of [['我的创作', '/projects'], ['Skill 管理', '/manage'], ['设置', '/settings'], ['首页', '/'], ['Skill 库', '/skills']]) {
    await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
    expect(new URL(page.url()).pathname).toBe(route);
    await assertShell(page);
  }
  await page.goto('/skills/missing');
  await expect(page.getByRole('heading', { name: '找不到这个 Skill' })).toBeVisible();
  await page.goto('/missing-route');
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible();
});

test('六页桌面截图、共享侧栏和笔记本宽度检查', async ({ page }) => {
  for (const [route, file] of [['/', '01-home'], ['/skills', '02-library'], ['/skills/paper-signal', '03-detail'], ['/create', '04-workspace'], ['/result/demo', '06-result']]) {
    await page.goto(route);
    await assertShell(page);
    await page.locator('img').first().waitFor();
    await page.evaluate(() => Promise.all(Array.from(document.images).map(img => img.decode())));
    await noOverflow(page);
    await page.screenshot({ path: `docs/screenshots-phase2/${file}.png`, fullPage: true, animations: 'disabled' });
    if (route === '/create') await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  }
  await page.goto('/create');
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  await page.waitForTimeout(6200);
  await assertShell(page);
  await noOverflow(page);
  await page.screenshot({ path: 'docs/screenshots-phase2/05-task.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '取消生成' }).click();
  await page.waitForTimeout(250);
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/skills', '/skills/paper-signal', '/create', '/result/demo']) {
      await page.goto(route);
      await page.evaluate(() => Promise.all(Array.from(document.images).map(img => img.decode())));
      await noOverflow(page);
    }
  }
});
