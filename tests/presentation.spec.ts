import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { presentationManifest, presentationProject } from './fixtures/presentation';
import { defaultSettings } from '../src/domain/skill';
import type { CanvasProject } from '../src/domain/types';
import type { SkillManifest } from '../src/domain/skill';
import { createShowcaseProjects } from '../src/application/showcase';

async function seed(page: Page, manifests: SkillManifest[], projects: CanvasProject[]) {
  await page.goto('/settings'); await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  await page.evaluate(state => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('skill-canvas-local');
    request.onsuccess = () => { const db = request.result, transaction = db.transaction('records', 'readwrite'); transaction.objectStore('records').put(state, 'app-state'); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => reject(transaction.error); };
  }), { schema: 2, settings: { ...defaultSettings, showDemoSkills: false }, manifests, projects, activeProjectId: projects[0]?.id || null });
  await page.goto('/projects');
}

test('八种输出比例均完整 contain，不拉伸、不裁切；原图边框与主体可辨认', async ({ page }) => {
  const manifest = presentationManifest();
  await page.goto('/');
  const dimensions = [[600, 600], [640, 800], [600, 800], [600, 900], [450, 800], [960, 540], [900, 300], [800, 620]];
  // Geometry fixtures drawn as test content, not edited user images or claimed Skill results.
  const images = await page.evaluate(dimensions => dimensions.map(([width, height]) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e5dccb'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#c44030'; ctx.lineWidth = 14; ctx.strokeRect(8, 8, width - 16, height - 16);
    ctx.fillStyle = '#182c42'; ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(width + ' × ' + height, width / 2, height / 2);
    for (const [x, y] of [[20, 20], [width - 60, 20], [20, height - 60], [width - 60, height - 60]]) ctx.fillRect(x, y, 40, 40);
    return canvas.toDataURL('image/png');
  }), dimensions);
  const projects = images.map((image, i) => { const project = presentationProject(manifest, image, 'ratio-' + i); project.title = dimensions[i].join(' × '); return project; });
  await seed(page, [manifest], projects);
  for (const width of [1280, 1440, 1584]) {
    await page.setViewportSize({ width, height: 992 });
    const geometry = await page.locator('.project-artwork img').evaluateAll(images => images.map(element => {
      const image = element as HTMLImageElement, box = image.getBoundingClientRect(), stage = image.parentElement!.getBoundingClientRect();
      return { fit: getComputedStyle(image).objectFit, loaded: image.complete && image.naturalWidth > 0, width: box.width, height: box.height, stageWidth: stage.width, stageHeight: stage.height, transform: getComputedStyle(image).transform };
    }));
    expect(geometry).toHaveLength(8);
    for (const image of geometry) { expect(image.loaded).toBe(true); expect(image.fit).toBe('contain'); expect(image.transform).toBe('none'); expect(image.width).toBeLessThanOrEqual(image.stageWidth + 1); expect(image.height).toBeLessThanOrEqual(image.stageHeight + 1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'work/phase65/ratio-matrix.png', fullPage: true });
});

test('五类 Skill 卡片高度、摘要与 footer 对齐，真实来源与无案例明确', async ({ page }) => {
  const imagegen = presentationManifest(), zine = presentationManifest('gc-minimal-zine-poster-v0-3', 'zine');
  const empty = presentationManifest('无案例创作工具', 'empty');
  const long = presentationManifest('a-very-long-technical-skill-name-for-consistent-card-layout-v1-0', 'long');
  const description = presentationManifest('中文摘要工具', 'description'); description.description = '可信中文摘要用于测试文字长度和两行限制。'.repeat(35);
  const projects = [presentationProject(imagegen), presentationProject(zine, '/artwork/result-v4.png', 'zine-project')];
  await seed(page, [imagegen, zine, empty, long, description], projects); await page.goto('/skills');
  await expect(page.locator('.skill-card')).toHaveCount(5); await expect(page.getByRole('link', { name: 'Minimal Zine Poster', exact: true })).toBeVisible();
  await expect(page.locator('.skill-card').filter({ hasText: '无案例创作工具' })).toContainText('暂无验证案例');
  const rows = await page.locator('.skill-card').evaluateAll(cards => cards.map(card => {
    const rect = card.getBoundingClientRect(), footer = card.querySelector('.skill-card-meta')!.getBoundingClientRect(), text = card.querySelector(':scope > p')!;
    return { height: rect.height, footer: footer.y - rect.y, clamp: getComputedStyle(text).webkitLineClamp, overflow: text.scrollWidth > text.clientWidth };
  }));
  expect(Math.max(...rows.map(row => row.height)) - Math.min(...rows.map(row => row.height))).toBeLessThan(2);
  expect(Math.max(...rows.map(row => row.footer)) - Math.min(...rows.map(row => row.footer))).toBeLessThan(2);
  for (const row of rows) { expect(row.clamp).toBe('2'); expect(row.overflow).toBe(false); }
  await page.getByRole('link', { name: '查看 Minimal Zine Poster 详情', exact: true }).click();
  await expect(page.locator('.featured-example')).toContainText('本机实测');
  await expect(page.locator('.before-after')).toHaveCount(0);
});

test('草稿、失败、生成中状态明确，参考图不作为结果封面，轻操作需展开', async ({ page }) => {
  const manifest = presentationManifest(), projects = ['draft', 'failed', 'running'].map((status, i) => {
    const project = presentationProject(manifest, '', 'state-' + i); project.status = status as CanvasProject['status']; project.title = '状态作品 ' + i; project.generations = []; project.thumbnail = '/artwork/category-photo.png'; return project;
  });
  await seed(page, [manifest], projects);
  await expect(page.locator('.project-card').filter({ hasText: '状态作品 0' })).toContainText('草稿');
  await expect(page.locator('.project-card').filter({ hasText: '状态作品 1' })).toContainText('生成失败');
  await expect(page.locator('.project-card').filter({ hasText: '状态作品 2' })).toContainText('生成中');
  await expect(page.locator('.project-artwork img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '删除项目：状态作品 0', exact: true })).not.toBeVisible();
  await page.getByLabel('作品操作：状态作品 0').click(); await expect(page.getByRole('button', { name: '删除项目：状态作品 0', exact: true })).toBeVisible();
});

test('首页/库/详情/工作台共用名称版本；首页和作品页打开同一结果；标题不随 Prompt 改写', async ({ page }) => {
  const manifest = presentationManifest('gc-minimal-zine-poster-v0-3'), project = presentationProject(manifest);
  await seed(page, [manifest], [project]);
  for (const route of ['/', '/skills']) { await page.goto(route); await expect(page.locator('.skill-card')).toContainText('Minimal Zine Poster'); await expect(page.locator('.skill-card')).toContainText('v1.0.0'); }
  await page.goto('/'); await page.getByRole('button', { name: '打开项目：未命名作品', exact: true }).click(); const result = page.url();
  await expect(page.locator('.page-description')).toContainText('未命名作品 · Minimal Zine Poster · v1.0.0');
  await page.goto('/projects'); await page.getByRole('button', { name: '打开项目：未命名作品', exact: true }).click(); expect(page.url()).toBe(result);
  await page.goto('/skills/' + manifest.id); await expect(page.getByRole('heading', { name: 'Minimal Zine Poster', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '使用此 Skill', exact: true }).click(); await expect(page.locator('.selected-skill')).toContainText('Minimal Zine Poster'); await expect(page.locator('.skill-pinned-version')).toContainText('v1.0.0');
  await page.getByLabel('提示词', { exact: true }).fill('很长的提示词不能成为作品标题，不能在结果列表抢视觉'); await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  await page.reload(); await page.goto('/projects');
  for (const caption of await page.locator('.project-caption').all()) await expect(caption).not.toContainText('很长的提示词');
});

test('专用封面和单用途案例可追溯，Prompt 可展开，示例项目不进入我的创作', async ({ page }) => {
  const manifest = presentationManifest(), planned = createShowcaseProjects(manifest);
  const projects = planned.map((plan, i) => {
    const project = presentationProject(manifest, i ? '/artwork/result-v4.png' : '/artwork/category-photo.png', plan.id);
    project.showcase = plan.showcase; project.title = plan.title;
    project.generations[0].codex!.compiledTask!.showcase = plan.showcase;
    project.generations[0].codex!.result!.finalPrompt = 'UI 测试专用 Prompt，不是真实生成证据。';
    return project;
  });
  await seed(page, [manifest], projects); await expect(page.locator('.project-card')).toHaveCount(0);
  await page.goto('/skills'); await expect(page.locator('.skill-card')).toHaveAttribute('data-example-source', 'generated_showcase');
  await page.goto('/skills/' + manifest.id);
  await expect(page.locator('.featured-example')).toContainText('通用图像创作');
  await expect(page.locator('.example-gallery figure')).toHaveCount(1);
  await expect(page.locator('.example-gallery')).toContainText('产品摄影');
  await expect(page.getByLabel('Skill 封面与案例生成')).toContainText('封面 1/1 · 用途案例 1/1');
  await page.locator('.example-gallery').getByText('查看案例 Prompt', { exact: true }).first().click();
  await expect(page.locator('.example-gallery pre').first()).toBeVisible();
  await expect(page.locator('.example-gallery pre').first()).toContainText('UI 测试专用 Prompt');
  await expect(page.locator('.before-after')).toHaveCount(0);
  await page.getByRole('button', { name: '使用此 Skill', exact: true }).click();
  await expect(page.locator('.workspace-skill-capabilities')).toContainText('文本');
  await expect(page.locator('.workspace-skill-capabilities')).not.toContainText('未验证');
  await expect(page.locator('.selected-skill-artwork img')).toHaveAttribute('src', '/artwork/category-photo.png');
});
