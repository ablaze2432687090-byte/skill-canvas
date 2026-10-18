import {handleDialog} from './fixtures/appDialogs';
import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';

async function importSkills(page: Page) {
  await page.goto('/settings');
  await page.getByLabel('导入 Skill 目录', { exact: true }).setInputFiles(path.resolve('tests/fixtures/skills'));
  await expect(page.locator('.root-description strong')).toHaveText('skills');
  await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
}
async function saved(page: Page) { await expect(page.locator('.save-indicator')).toHaveText('已保存到本地'); }

test('本地目录 → 真实 Manifest → 项目/图片角色/五类参数 → 刷新恢复 → 模拟结果 → 重新打开', async ({ page, context }) => {
  await importSkills(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Skill 库', exact: true }).click();
  await page.getByRole('link', { name: '查看 Local Poster 详情', exact: true }).click();
  await expect(page.getByRole('heading', { name: '暂无验证案例' })).toBeVisible();
  await expect(page.locator('.detail-info')).toContainText('1.2.0');
  await expect(page.locator('.detail-info')).toContainText('skills/local-poster');
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await page.getByRole('button', { name: '使用此 Skill' }).click();
  await page.getByLabel('提示词', { exact: true }).fill('持久化验收项目');
  await page.getByLabel('具体要求（可选）').fill('保留构图与参考主体');
  await expect(page.getByLabel('风格强度', { exact: true })).toHaveValue('65');
  await page.getByLabel('风格强度', { exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('group', { name: '配色' }).getByRole('button', { name: '鲜明', exact: true }).click();
  await page.getByLabel('保留主体', { exact: true }).uncheck();
  await page.getByLabel('迭代次数', { exact: true }).fill('7');
  await page.getByLabel('画面标题', { exact: true }).fill('本地项目测试');
  await page.getByLabel('添加参考图').setInputFiles(path.resolve('public/artwork/category-photo.png'));
  await page.getByLabel('category-photo.png 的角色').selectOption('subject_reference');
  await saved(page);
  await page.reload();
  await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('持久化验收项目');
  await expect(page.getByLabel('风格强度', { exact: true })).toHaveValue('66');
  await expect(page.getByRole('button', { name: '鲜明', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('保留主体', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('迭代次数', { exact: true })).toHaveValue('7');
  await expect(page.getByLabel('画面标题', { exact: true })).toHaveValue('本地项目测试');
  await expect(page.getByLabel('category-photo.png 的角色')).toHaveValue('subject_reference');
  await expect(page.getByAltText('category-photo.png', { exact: true })).toBeVisible();
  // A new page in the same browser profile restores IndexedDB, not sessionStorage.
  const second = await context.newPage();
  await second.goto('/create');
  await expect(second.getByLabel('提示词', { exact: true })).toHaveValue('持久化验收项目');
  await expect(second.getByLabel('category-photo.png 的角色')).toHaveValue('subject_reference');
  await second.close();
  await page.getByRole('button', { name: '在 Codex 中生成', exact: true }).click();
  await page.getByRole('button', { name: '完成模拟并查看结果' }).click();
  await expect(page.getByRole('heading', { name: '作品已生成' })).toBeVisible();
  await expect(page.locator('.saved-status')).toContainText('已保存到本地项目');
  const resultUrl = page.url();
  await page.getByRole('navigation').getByRole('link', { name: '我的创作', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('.project-card')).toContainText('Local Poster');
  await page.getByRole('button', { name: '打开项目：未命名作品', exact: true }).click();
  await expect(page).toHaveURL(resultUrl);
  await page.getByRole('button', { name: '继续修改' }).click();
  await expect(page.getByLabel('画面标题', { exact: true })).toHaveValue('本地项目测试');
  await saved(page);
});

test('真实管理状态、收藏和设置跨页面恢复；不同 Skill 不显示同一组参数', async ({ page }) => {
  await importSkills(page);
  await page.getByLabel('更新策略', { exact: true }).selectOption('notify');
  await page.getByLabel('显示演示 Skill').uncheck();
  await saved(page);
  await page.reload();
  await expect(page.getByLabel('更新策略', { exact: true })).toHaveValue('notify');
  await expect(page.getByLabel('显示演示 Skill')).not.toBeChecked();
  await page.getByRole('navigation').getByRole('link', { name: 'Skill 管理', exact: true }).click();
  await expect(page.locator('.management-row')).toHaveCount(2);
  await page.getByRole('button', { name: '需要配置', exact: true }).click();
  await expect(page.locator('.management-row')).toContainText('Missing Dependency');
  await page.getByRole('button', { name: '异常', exact: true }).click();
  await expect(page.locator('.management-row')).toHaveCount(4);
  await expect(page.locator('.management-list')).toContainText('重复 Skill ID');
  await expect(page.locator('.management-list')).toContainText('缺少 SKILL.md');
  await page.getByRole('button', { name: '可更新', exact: true }).click();
  await expect(page.getByRole('heading', { name: '此分类暂无 Skill', exact: true })).toBeVisible();
  await expect(page.locator('.management-row')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Skill 库', exact: true }).click();
  await expect(page.locator('.skill-card').getByText('演示 Skill', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '查看 Local Poster 详情', exact: true }).click();
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.getByRole('button', { name: '已收藏', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation').getByRole('link', { name: 'Skill 库', exact: true }).click();
  await page.getByRole('link', { name: '查看 Plain Markdown Skill 详情', exact: true }).click();
  await expect(page.locator('.detail-info')).toContainText('未声明');
  await page.getByRole('button', { name: '使用此 Skill' }).click();
  await expect(page.getByText('此 Skill 未声明参数，使用默认输出设置。')).toBeVisible();
  await expect(page.getByLabel('风格强度', { exact: true })).toHaveCount(0);
  await saved(page);
});

test('删除项目必须确认，取消不会删除，确认后刷新和新页面均无该项目', async ({ page, context }) => {
  await page.goto('/create');
  await page.getByLabel('提示词', { exact: true }).fill('删除确认测试');
  await page.getByLabel('添加参考图').setInputFiles(path.resolve('public/artwork/category-photo.png'));
  await saved(page);
  await page.getByRole('navigation').getByRole('link', { name: '我的创作', exact: true }).click();
  await page.getByLabel('作品操作：未命名作品').click();
  await handleDialog(page, dialog => dialog.dismiss());
  await page.getByRole('button', { name: '删除项目：未命名作品', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await handleDialog(page, dialog => dialog.accept());
  await page.getByRole('button', { name: '删除项目：未命名作品', exact: true }).click();
  await expect(page.getByRole('heading', { name: '还没有创作项目' })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.locator('.project-card')).toHaveCount(0);
  const next = await context.newPage(); await next.goto('/projects');
  await expect(next.getByRole('heading', { name: '还没有创作项目' })).toBeVisible();
  await next.close();
});

test('空目录状态诚实显示，保存失败可见并能重试', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('显示演示 Skill').uncheck(); await saved(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Skill 库', exact: true }).click();
  await expect(page.getByText('尚未安装可用 Skill', { exact: true })).toBeVisible();
  await expect(page.locator('.skill-card')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: '设置', exact: true }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      IDBObjectStore.prototype.put = original;
      if (key === 'app-state') throw new DOMException('测试存储空间不足', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await page.getByLabel('显示演示 Skill').check();
  await expect(page.locator('.save-indicator')).toContainText('保存失败');
  await page.getByRole('button', { name: '重试保存' }).click(); await saved(page);
  await page.reload(); await expect(page.getByLabel('显示演示 Skill')).toBeChecked();
});

test('真实数据页面在三种桌面宽度不横向溢出', async ({ page }) => {
  await importSkills(page);
  for (const width of [1584, 1440, 1280]) {
    await page.setViewportSize({ width, height: 992 });
    for (const route of ['/skills', '/manage', '/settings', '/projects']) {
      await page.goto(route);
      await expect(page.getByRole('heading').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1584) await page.screenshot({ path: `docs/screenshots-phase2/${route.slice(1)}-real.png`, fullPage: true });
    }
  }
});

test('关闭并重新启动浏览器后项目、图片 Blob 和设置恢复', async () => {
  const parent = path.resolve('.tmp/browser-profiles');
  await mkdir(parent, { recursive: true });
  const profile = await mkdtemp(path.join(parent, 'persistence-'));
  const options = { channel: 'msedge', headless: true, viewport: { width: 1440, height: 992 }, baseURL: 'http://127.0.0.1:5173' };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = context.pages()[0];
    await page.goto('/settings');
    await page.getByLabel('更新策略', { exact: true }).selectOption('notify'); await saved(page);
    await page.goto('/create');
    await page.getByLabel('提示词', { exact: true }).fill('浏览器重启验收');
    await page.getByLabel('添加参考图').setInputFiles(path.resolve('public/artwork/category-photo.png'));
    await page.getByLabel('category-photo.png 的角色').selectOption('brand_asset'); await saved(page);
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = context.pages()[0];
    await page.goto('/create');
    await expect(page.getByLabel('提示词', { exact: true })).toHaveValue('浏览器重启验收');
    await expect(page.getByLabel('category-photo.png 的角色')).toHaveValue('brand_asset');
    expect(await page.getByAltText('category-photo.png', { exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.goto('/settings');
    await expect(page.getByLabel('更新策略', { exact: true })).toHaveValue('notify');
  } finally {
    await context.close();
    if (path.dirname(profile) === parent && path.basename(profile).startsWith('persistence-')) await rm(profile, { recursive: true, force: true });
  }
});
