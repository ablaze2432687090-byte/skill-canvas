import { test, expect } from '@playwright/test';

test('language switches near the top of Settings, persists and preserves user prompts', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('.setting-row').filter({ has: page.getByText('Interface', { exact: true }) })).toContainText('English');
  expect((await page.getByRole('heading', { name: 'Language', exact: true }).boundingBox())!.y).toBeLessThan(600);
  await expect(page.locator('.save-indicator')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  for (const route of ['/', '/skills', '/skills/paper-signal', '/create', '/projects', '/manage', '/settings']) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(route);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (route === '/skills' || route === '/') {
      for (const description of await page.locator('.skill-card > p').allTextContents()) expect(description).not.toMatch(/[\u3400-\u9fff]/);
    }
    if (route === '/skills/paper-signal') {
      expect(await page.locator('.page-description').innerText()).not.toMatch(/[\u3400-\u9fff]/);
      for (const caption of await page.locator('.detail-artwork figcaption').allTextContents()) expect(caption).not.toMatch(/[\u3400-\u9fff]/);
    }
  }
  await page.goto('/create');
  const prompt = '设置：中文内容不翻译 / raw prompt stays intact';
  await page.getByLabel('Prompt', { exact: true }).fill(prompt);
  await page.getByRole('button', { name: 'Generate in Codex', exact: true }).click();
  await expect(page).toHaveURL(/\/task\/mock-/);
  await page.getByRole('button', { name: 'Complete mock task and view result' }).click();
  await expect(page).toHaveURL(/\/result\/mock-/);
  await expect(page.locator('body')).toContainText(prompt);
  await page.goto('/settings');
  await page.getByRole('button', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test.describe('first launch in an English system', () => {
  test.use({ locale: 'en-US' });
  test('defaults to English without a separate app build', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });
});
