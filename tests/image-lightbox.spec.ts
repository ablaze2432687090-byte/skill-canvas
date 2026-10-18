import { test, expect } from '@playwright/test';

test('封面和案例共用浮窗：外部关闭、内部不关闭、Esc和关闭按钮', async ({ page }) => {
  await page.goto('/skills/paper-signal');
  const image = page.locator('.featured-example img');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await image.click();
  const dialog = page.getByRole('dialog', { name: '图片预览' });
  await expect(dialog).toBeVisible();
  await dialog.locator('.lightbox-image-space img').click();
  await expect(dialog).toBeVisible();
  await dialog.click({ position: { x: 10, y: 10 } });
  await expect(dialog).toHaveCount(0);
  await page.locator('.example-gallery img').click();
  await expect(dialog.locator('.lightbox-counter')).toHaveText('2 / 2');
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await image.focus(); await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '关闭图片预览' }).click(); await expect(dialog).toHaveCount(0);
});

test('切换、缩放、适应窗口及重复点击选中缩略图', async ({ page }) => {
  await page.goto('/skills/paper-signal'); await page.locator('.featured-example img').click();
  const dialog = page.getByRole('dialog'), image = dialog.locator('.lightbox-image-space img');
  await expect(image).toBeVisible();
  expect(await dialog.locator('.lightbox-stage').evaluate(element => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
  const fit = (await image.boundingBox())!;
  await dialog.getByRole('button', { name: '放大图片', exact: true }).click();
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(fit.width);
  await dialog.getByRole('button', { name: '适应窗口', exact: true }).click();
  await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(fit.width, 0);
  await dialog.getByRole('button', { name: '查看第 1 张图片' }).click(); await expect(image).toBeVisible();
  await expect(dialog.getByRole('button', { name: '查看原图', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '下一张图片' }).click(); await expect(dialog.locator('.lightbox-counter')).toHaveText('2 / 2');
  await expect(image).toBeVisible(); await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('.lightbox-counter')).toHaveText('1 / 2');
  const aspect = await image.evaluate((img: HTMLImageElement) => { const box = img.getBoundingClientRect(); return Math.abs(box.width / box.height - img.naturalWidth / img.naturalHeight); });
  expect(aspect).toBeLessThan(.001);
});

test('列表进入详情，图库只包含当前 Skill，关闭恢复位置', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 }); await page.goto('/skills');
  const image = page.locator('.skill-card img').first(); await image.scrollIntoViewIfNeeded();
  await image.click(); await expect(page).toHaveURL(/\/skills\/paper-signal$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const sources = await page.locator('.detail-artwork img').evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));
  await page.locator('.example-gallery img').scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY); await page.locator('.example-gallery img').click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  expect(await dialog.locator('.lightbox-thumbnails img').evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src))).toEqual(sources);
  const box = (await dialog.locator('.lightbox-image-space img').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(10, 10); await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(y, 0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('Ctrl 滚轮仅缩放图片，拖动受浮窗裁切，适应窗口重置', async ({ page }) => {
  await page.goto('/skills/paper-signal'); await page.locator('.featured-example img').click();
  const dialog = page.getByRole('dialog'), image = dialog.locator('.lightbox-image-space img'), stage = dialog.locator('.lightbox-stage');
  await expect(image).toBeVisible(); const fit = (await image.boundingBox())!;
  const area = (await stage.boundingBox())!, y = await page.evaluate(() => scrollY), scale = await page.evaluate(() => visualViewport!.scale);
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -400); await page.mouse.wheel(0, -400); await page.keyboard.up('Control');
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(fit.width * 3);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(scale);
  const before = (await image.boundingBox())!;
  await page.mouse.down(); await page.mouse.move(area.x + area.width / 2 + 100, area.y + area.height / 2 + 80); await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())!.y).toBeGreaterThan(before.y + 20);
  expect(await stage.evaluate(element => getComputedStyle(element).overflow)).toBe('hidden');
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await dialog.getByRole('button', { name: '适应窗口' }).click();
  await expect.poll(async () => (await image.boundingBox())!.width).toBeCloseTo(fit.width, 0);
  await page.mouse.wheel(0, 500); expect(await page.evaluate(() => scrollY)).toBe(y);
});
