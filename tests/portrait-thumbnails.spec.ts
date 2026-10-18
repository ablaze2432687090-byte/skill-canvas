import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { defaultSettings } from '../src/domain/skill';
import { presentationManifest, presentationProject } from './fixtures/presentation';

const viewports = [{ width: 1280, columns: 4 }, { width: 1440, columns: 4 }, { width: 1920, columns: 5 }, { width: 2560, columns: 6 }];
const dimensions = [[120, 160], [192, 108], [140, 140], [90, 160], [180, 120], [120, 150], [60, 180], [180, 60]];

async function seedPortraitFixtures(page: Page) {
  await page.goto('/settings');
  await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  // Purpose-made geometry fixtures, not altered user artwork or claimed generation evidence.
  const images = await page.evaluate(sizes => sizes.map(([width, height], index) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = ['#d8c6ad', '#a9c6cc', '#c9b5ce', '#c8ceaf'][index % 4]; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#743021'; ctx.lineWidth = 6; ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.fillStyle = '#203044'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${width}:${height}`, width / 2, height / 2);
    return canvas.toDataURL('image/png');
  }), dimensions);
  const manifests = images.map((_, index) => {
    const manifest = presentationManifest(index ? `版式验证工具 ${index}` : '唯一封面样本', `portrait-skill-${index}`);
    manifest.description = index % 2 ? '为长标题和中文摘要验证卡片对齐与清晰度。'.repeat(12) : '文本与图片创作。';
    return manifest;
  });
  const projects = images.map((image, index) => {
    const project = presentationProject(manifests[index], image, `portrait-project-${index}`);
    project.title = index % 2 ? `中文长标题与完整画幅验证 ${index} 保留主体与画面四周` : `比例样本 ${index}`;
    const output = project.generations[0].codex!.result!.outputs[0];
    [output.width, output.height] = dimensions[index];
    return project;
  });
  // Give one detail page a genuine fixture cover plus two differently shaped local examples.
  for (let index = 1; index <= 2; index++) {
    const project = presentationProject(manifests[0], images[index], `portrait-case-${index}`);
    project.title = `用途案例 ${index}`; projects.push(project);
  }
  const empty = presentationProject(manifests[0], '', 'portrait-empty');
  empty.title = '未生成草稿'; empty.status = 'draft'; empty.generations = []; projects.push(empty);
  await page.evaluate(state => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('skill-canvas-local');
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('records', 'readwrite');
      transaction.objectStore('records').put(state, 'app-state');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  }), { schema: 2, settings: { ...defaultSettings, codexMode: 'mock', showDemoSkills: false }, manifests, projects, activeProjectId: projects[0].id });
  await page.goto('/projects');
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The desktop page must not scroll horizontally').toBe(true);
}

async function assertPortraitFrames(frames: Locator) {
  expect(await frames.count()).toBeGreaterThan(0);
  await frames.locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  const geometry = await frames.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect(), image = element.querySelector('img'), imgStyle = image ? getComputedStyle(image) : null;
    return { ratio: rect.width / rect.height, width: rect.width, height: rect.height, fit: imgStyle?.objectFit, transform: imgStyle?.transform, loaded: image ? image.complete && image.naturalWidth > 0 : true };
  }));
  for (const frame of geometry) {
    expect(frame.width).toBeGreaterThan(0); expect(frame.height).toBeGreaterThan(0);
    expect(frame.ratio, 'Every cover and case viewport uses the same fixed 3:4 ratio').toBeCloseTo(3 / 4, 2);
    expect(frame.loaded).toBe(true);
    if (frame.fit) { expect(frame.fit, 'Legacy landscape, square and portrait artwork must remain complete').toBe('contain'); expect(frame.transform).toBe('none'); }
  }
}

async function assertGrid(grid: Locator, columns: number) {
  const layout = await grid.evaluate(element => {
    const cards = [...element.children].filter(card => getComputedStyle(card).display !== 'none').map(card => {
      const rect = card.getBoundingClientRect(), title = card.querySelector('h3');
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0 };
    });
    return { tracks: getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length, cards };
  });
  expect(layout.tracks).toBe(columns);
  expect(layout.cards.filter(card => Math.abs(card.y - layout.cards[0].y) < 1)).toHaveLength(Math.min(layout.cards.length, columns));
  expect(Math.max(...layout.cards.map(card => card.width)) - Math.min(...layout.cards.map(card => card.width))).toBeLessThan(1);
  for (const card of layout.cards) expect(card.titleSize, 'Card names must remain readable at desktop density').toBeGreaterThanOrEqual(12);
}

for (const { width, columns } of viewports) {
  test(`${width}px: 首页、Skill 库与创作列表保持 ${columns} 列和固定 3:4 缩略图`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await seedPortraitFixtures(page);
    for (const [route, grids] of [['/', ['.recommended-grid', '.recent-grid']], ['/skills', ['.library-grid']], ['/projects', ['.projects-grid']]] as const) {
      await page.goto(route);
      for (const selector of grids) await assertGrid(page.locator(selector), columns);
      await assertPortraitFrames(page.locator('.artwork-thumbnail:visible'));
      await assertNoOverflow(page);
      await page.screenshot({ path: `work/portrait-thumbnails/${width}-${route === '/' ? 'home' : route.slice(1)}.png`, fullPage: true, animations: 'disabled' });
    }
    // Filtering must leave a normal-sized card, not stretch the last item across the whole row.
    await page.goto('/skills');
    const initialWidth = (await page.locator('.skill-cover').first().boundingBox())!.width;
    await page.getByRole('textbox', { name: '搜索 Skill 名称…' }).fill('唯一封面样本');
    await expect(page.locator('.skill-card')).toHaveCount(1);
    expect((await page.locator('.skill-cover').boundingBox())!.width).toBeCloseTo(initialWidth, 1);
    await assertPortraitFrames(page.locator('.skill-cover .artwork-thumbnail'));
    await assertNoOverflow(page);
  });

  test(`${width}px: 详情、工作台和版本缩略图统一比例，结果原图保持完整大图`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    await seedPortraitFixtures(page);
    await page.goto('/skills/portrait-skill-0');
    // The current product contract is one cover + exactly one use case.
    await expect(page.locator('.example-gallery figure')).toHaveCount(1);
    await assertPortraitFrames(page.locator('.featured-example .artwork-thumbnail, .example-gallery .artwork-thumbnail'));
    await assertNoOverflow(page);
    await page.getByRole('button', { name: '使用此 Skill', exact: true }).click();
    await assertPortraitFrames(page.locator('.selected-skill-artwork'));
    await assertNoOverflow(page);
    // A landscape result intentionally retains its original composition in the full-art viewer.
    await page.goto('/result/portrait-project-1-task');
    await expect(page.getByAltText('生成结果 V1', { exact: true })).toBeVisible();
    await assertPortraitFrames(page.locator('.version-item .artwork-thumbnail'));
    const fullArt = await page.locator('.result-viewer img').evaluate(image => {
      const rect = image.getBoundingClientRect();
      return { fit: getComputedStyle(image).objectFit, width: rect.width, height: rect.height, inThumbnail: !!image.closest('.artwork-thumbnail') };
    });
    expect(fullArt.fit).toBe('contain'); expect(fullArt.inThumbnail).toBe(false);
    expect(fullArt.width).toBeGreaterThan(300); expect(fullArt.height).toBeGreaterThan(300);
    await assertNoOverflow(page);
  });
}
