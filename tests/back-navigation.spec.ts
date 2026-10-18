import { test, expect } from '@playwright/test';

for (const width of [1280, 1584, 1920]) {
  test(`Skill 详情返回键及标题对齐 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('heading', { name: 'Paper Signal', exact: true }).getByRole('link').click();
    const back = page.getByRole('link', { name: '返回 Skill 库', exact: true });
    await expect(back).toBeVisible();
    const button = (await back.boundingBox())!;
    const heading = (await page.locator('.page-header h1').boundingBox())!;
    const description = (await page.locator('.page-description').boundingBox())!;
    expect(button.width).toBe(48);
    expect(button.height).toBe(48);
    expect(heading.x).toBe(button.x + button.width + 16);
    expect(description.x).toBe(heading.x);
    const textBlock = (await page.locator('.detail-heading .page-header-copy').boundingBox())!;
    expect(button.y + button.height / 2).toBeCloseTo(textBlock.y + textBlock.height / 2, 1);
    const arrow = (await back.locator('svg').boundingBox())!;
    const content = (await page.locator('.detail-layout').boundingBox())!;
    expect(button.x).toBe(content.x);
    expect(arrow.x + arrow.width / 2).toBe(button.x + button.width / 2);
    expect(arrow.y + arrow.height / 2).toBe(button.y + button.height / 2);
    await back.hover();
    expect(await back.boundingBox()).toEqual(button);
    expect(await back.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe('1px');
    await page.keyboard.press('Tab');
    await back.focus();
    expect(await back.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    expect(await back.boundingBox()).toEqual(button);
    expect(await page.locator('.detail-heading h1').evaluate(element => getComputedStyle(element).fontSize)).toBe('28px');
    await page.evaluate(() => window.scrollTo({ top: 650 }));
    await expect.poll(async () => (await page.locator('.detail-heading').boundingBox())?.y).toBe(0);
    await expect(back).toBeVisible();
    const header = (await page.locator('.detail-heading').boundingBox())!;
    const copy = (await page.locator('.page-description').boundingBox())!;
    expect(copy.y + copy.height).toBeLessThanOrEqual(header.y + header.height);
    expect(await page.evaluate(() => {
      const header = document.querySelector('.detail-heading')!.getBoundingClientRect();
      return !!document.elementFromPoint(header.right - 10, header.top + 10)?.closest('.detail-heading');
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await back.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/skills$/);
    // Direct entry/reload must have a deterministic destination, not browser history.
    await page.goBack();
    await page.reload();
    await page.getByRole('link', { name: '返回 Skill 库', exact: true }).click();
    await expect(page).toHaveURL(/\/skills$/);
  });
}

test('工作台返回保留输入，任务返回不取消，结果返回创作列表', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Paper Signal', exact: true }).getByRole('link').click();
  await page.getByRole('button', { name: '使用此 Skill' }).click();
  await page.getByLabel('提示词', { exact: true }).fill('Back navigation preserves this draft');
  await page.getByRole('link', { name: '返回 Skill 详情', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paper Signal', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('Back navigation preserves this draft');
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  await expect(page).toHaveURL(/\/task\//);
  const taskUrl = page.url();
  await page.getByRole('link', { name: '返回我的创作（任务继续执行）', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.goBack();
  await expect(page).toHaveURL(taskUrl);
  await page.getByRole('button', { name: '完成模拟并查看结果' }).click();
  await expect(page).toHaveURL(/\/result\//);
  await page.getByRole('link', { name: '返回我的创作', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});
