import { test, expect } from '@playwright/test';

test('详情 Esc 与返回键一致，恢复列表滚动位置', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/skills');
  const link = page.locator('.skill-card .skill-cover').last();
  await link.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(100);
  await link.click();
  await expect(page.locator('.page-back')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/skills$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
});

test('Esc 先关闭图片浮窗，再次 Esc 才退回列表', async ({ page }) => {
  await page.goto('/skills/paper-signal');
  await page.locator('.featured-example img').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/skills\/paper-signal$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/skills$/);
});

test('工作台 Esc 保留草稿，任务 Esc 不取消任务，结果 Esc 返回创作列表', async ({ page }) => {
  await page.goto('/skills/paper-signal');
  await page.getByRole('button', { name: '使用此 Skill' }).click();
  await page.getByLabel('提示词', { exact: true }).fill('Escape must keep the draft');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/skills\/paper-signal$/);
  await page.goBack();
  await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('Escape must keep the draft');
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  await expect(page).toHaveURL(/\/task\//);
  const taskUrl = page.url();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects$/);
  await page.goBack();
  await expect(page).toHaveURL(taskUrl);
  await page.getByRole('button', { name: '完成模拟并查看结果' }).click();
  await expect(page).toHaveURL(/\/result\//);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/projects$/);
});

test('列表无返回目标，长按或已被处理的 Esc 不触发退回', async ({ page }) => {
  await page.goto('/skills');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/skills$/);
  await page.goto('/skills/paper-signal');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat: true, bubbles: true })));
  await expect(page).toHaveURL(/\/skills\/paper-signal$/);
  await page.evaluate(() => { const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }); event.preventDefault(); window.dispatchEvent(event); });
  await expect(page).toHaveURL(/\/skills\/paper-signal$/);
});
