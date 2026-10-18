import { test, expect } from '@playwright/test';

test('返回 Skill 库恢复滚动位置，右下浮钮返回顶部', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto('/skills');
  const links = page.locator('.library-grid .skill-card-heading h3 a');
  await expect(links.last()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)))).toBeLessThan(1);
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeGreaterThan(300);
  await links.last().evaluate(element => (element as HTMLAnchorElement).click());
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('link', { name: '返回 Skill 库', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  await page.getByRole('link', { name: 'Skill 库', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  const top = page.getByRole('button', { name: '返回顶部', exact: true });
  await expect(top).toBeVisible();
  const box = (await top.boundingBox())!;
  expect(box.width).toBe(56); expect(box.height).toBe(56);
  const group = (await page.getByRole('toolbar', { name: '页面操作' }).boundingBox())!;
  expect(group.x + group.width).toBe(1280 - 20);
  expect(group.y + group.height).toBe(400 - 32);
  const refresh = (await page.getByRole('button', { name: '刷新当前页面' }).boundingBox())!;
  expect(refresh.y - box.y - box.height).toBe(12);
  await top.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(top).toBeDisabled();
});

test('浏览器返回恢复列表，同时保留搜索与筛选', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 620 });
  await page.goto('/skills?q=a');
  const search = page.getByRole('textbox', { name: '搜索 Skill 名称…' });
  await expect(search).toHaveValue('a');
  await page.locator('.library-filter-panel summary').click();
  await page.getByLabel('输出类型', { exact: true }).selectOption('PNG');
  const count = await page.locator('.skill-card').count();
  const link = page.locator('.library-grid .skill-card-heading h3 a').last();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  const y = await page.evaluate(() => scrollY);
  await link.evaluate(element => (element as HTMLAnchorElement).click());
  await page.goBack();
  await expect(search).toHaveValue('a');
  await expect(page.getByLabel('输出类型', { exact: true })).toHaveValue('PNG');
  await expect(page.locator('.skill-card')).toHaveCount(count);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  await page.locator('.library-grid .skill-card-heading h3 a').last().click();
  await page.getByRole('link', { name: '返回 Skill 库', exact: true }).click();
  await expect(page).toHaveURL(/\/skills\?q=a$/);
  await expect(search).toHaveValue('a');
});

test('直接打开详情后返回列表默认顶部', async ({ page }) => {
  await page.goto('/skills');
  const href = await page.locator('.library-grid .skill-cover').first().getAttribute('href');
  await page.goto(href!);
  await page.getByRole('link', { name: '返回 Skill 库', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByRole('button', { name: '返回顶部', exact: true })).toBeDisabled();
});

test('刷新保留当前搜索、筛选及草稿，不重新发送生成任务', async ({ page }) => {
  await page.goto('/skills');
  const search = page.getByRole('textbox', { name: '搜索 Skill 名称…' });
  await search.fill('Paper');
  await page.getByRole('button', { name: '刷新当前页面' }).click();
  await expect(page.getByRole('button', { name: '刷新当前页面' })).toBeEnabled();
  await expect(search).toHaveValue('Paper');
  await page.locator('.skill-card-heading h3 a').first().click();
  await page.getByRole('button', { name: '使用此 Skill' }).click();
  await page.getByLabel('提示词', { exact: true }).fill('Preserve draft during soft refresh');
  const url = page.url();
  await page.getByRole('button', { name: '刷新当前页面' }).click();
  await expect(page.getByRole('button', { name: '刷新当前页面' })).toBeEnabled();
  await expect(page).toHaveURL(url);
  await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('Preserve draft during soft refresh');
});
