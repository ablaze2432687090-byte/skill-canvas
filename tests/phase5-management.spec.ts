import {handleDialog} from './fixtures/appDialogs';
import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SkillManifest } from '../src/domain/skill';
import type { CanvasProject, Draft, Generation } from '../src/domain/types';
import type { CodexTaskHandle, CompiledCodexTask } from '../bridge/protocol/task';
import { defaultSettings } from '../src/domain/skill';
import { compileCodexTask } from '../src/application/codexTaskCompiler';

// All Bridge traffic in this suite is intercepted. These are UI contract tests,
// not evidence of a real GitHub install, Codex execution, or generated image.
const timestamp = '2026-10-03T00:00:00.000Z';
const oldCommit = '1'.repeat(40), newCommit = '2'.repeat(40), nextCommit = '3'.repeat(40);
function manifest(version = 'v1.0.0', commit = oldCommit): SkillManifest {
  const id = 'managed-0123456789abcdef01234567';
  return {
    id, declaredId: 'management-smoke-poster', name: 'management-smoke-poster', description: '管理交互测试专用 Fixture，不是真实第三方 Skill。', categories: ['海报'],
    source: { type: 'github', repository: 'https://github.com/test-author/test-poster', author: 'test-author', path: `Skills/${id}/versions/${commit}/management-smoke-poster/SKILL.md`, fingerprint: commit, license: 'MIT', licenseStatus: '明确许可', licenseUrl: 'https://github.com/test-author/test-poster/blob/main/LICENSE', skillRoot: 'skills/poster' },
    version: { installed: version, latest: null, commit, updateStatus: 'unchecked', bundle: commit },
    runtime: { status: 'ready', compatible: true, dependencies: [], issues: [] },
    inputs: [{ id: 'prompt', type: '文本', label: '提示词', required: true }], outputs: [{ format: 'PNG', description: '测试原图' }],
    parameters: [{ id: 'palette', type: 'text', label: version === 'v1.0.0' ? '原版配色' : '新版配色', default: '中性色' }], examples: [],
    installation: { id, rootId: 'managed', path: `Skills/${id}/SKILL.md`, installed: true, installedAt: timestamp, updatedAt: timestamp, updateStrategy: 'notify', favorite: false, validation: 'valid', previousVersion: null }, instructions: 'This is a controlled UI fixture. Never execute it.',
  };
}

interface ManagementCall { action: string; input: Record<string, unknown> }
async function fakeBridge(page: Page, initial: SkillManifest[] = []) {
  const catalog = structuredClone(initial);
  const calls: ManagementCall[] = [];
  const tasks: CompiledCodexTask[] = [];
  let selected = manifest(), available = { version: 'v2.0.0', commit: newCommit };
  const reply = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5173', 'Access-Control-Allow-Headers': 'Content-Type, X-Skill-Canvas-Token', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' }, body: JSON.stringify(body) });
  await page.route('http://127.0.0.1:4717/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return reply(route, null, 204);
    if (pathname === '/session') return reply(route, { token: 'controlled-ui-test-token' });
    if (pathname === '/skills') return reply(route, catalog);
    if (pathname === '/projects') return reply(route, []);
    if (pathname === '/status') return reply(route, { connected: true, authenticated: true, bridge: 'ready', version: 'test-only', model: 'test-only', models: [], checkedAt: timestamp });
    if (pathname === '/capabilities') return reply(route, { automaticImageGeneration: false, reason: '管理交互 Fixture，不会生成图片。', fallback: 'confirmation_handoff', testedAt: null });
    if (pathname === '/tasks' && request.method() === 'POST') {
      const task = request.postDataJSON().task as CompiledCodexTask; tasks.push(task);
      // Only submission is simulated; never fabricates ImageGen or PNG success.
      return reply(route, { taskId: task.taskId, projectId: task.projectId, compiledTask: task, threadId: null, turnId: null, stage: 'failed', sequence: 1, text: '', instruction: task.instruction, workspace: 'test-only', action: task.action, startedAt: timestamp, updatedAt: timestamp, error: { code: 'CAPABILITY_UNAVAILABLE', message: '受控测试，不调用 ImageGen。' } });
    }
    if (!pathname.startsWith('/skill-management/')) return reply(route, { error: { message: 'UI 测试禁止访问真实生成接口。' } }, 501);
    const action = pathname.split('/').at(-1)!, input = request.postDataJSON() as Record<string, unknown>;
    calls.push({ action, input });
    if (action === 'preview') {
      selected = manifest();
      if (input.type === 'local') selected.source = { ...selected.source, type: 'local', repository: null, author: 'local-author', localPath: String(input.folder), licenseUrl: null, skillRoot: '' };
      return reply(route, { token: 'controlled-preview', source: selected.source, version: input.type === 'local' ? '安装时从文件读取' : selected.version.installed, commit: input.type === 'local' ? null : selected.version.commit, paths: input.type === 'local' ? [''] : ['skills/poster'] });
    }
    if (action === 'review') return reply(route, selected);
    if (action === 'install') { catalog.push(structuredClone(selected)); return reply(route, selected); }
    const current = catalog.find(item => item.id === input.id);
    if (!current) return reply(route, { error: { message: '受控 Fixture 未找到。' } }, 404);
    if (action === 'check') {
      current.version.latest = available.version; current.version.latestCommit = available.commit; current.version.checkedAt = timestamp;
      current.version.updateStatus = current.installation.locked ? 'locked' : current.installation.skippedVersion === available.commit ? 'skipped' : 'available';
    } else if (action === 'lock') {
      current.installation.locked = input.locked === true;
      current.version.updateStatus = current.installation.locked ? 'locked' : current.installation.skippedVersion === current.version.latestCommit ? 'skipped' : 'available';
    } else if (action === 'skip') {
      current.installation.skippedVersion = current.version.latestCommit; current.version.updateStatus = 'skipped';
    } else if (action === 'update') {
      current.installation.previousVersion = current.version.installed;
      current.version.installed = available.version; current.version.commit = available.commit; current.version.bundle = available.commit; current.version.updateStatus = 'current';
    } else if (action === 'rollback') {
      current.version.installed = current.installation.previousVersion; current.installation.previousVersion = null;
      current.version.commit = oldCommit; current.version.bundle = oldCommit; current.version.updateStatus = 'available';
    } else if (action === 'revalidate') {
      current.runtime = { ...current.runtime, status: 'ready', compatible: true, issues: [] };
    } else if (action === 'remove') {
      current.installation.installed = false; current.runtime.status = 'unavailable';
    } else return reply(route, { error: { message: `未模拟操作 ${action}` } }, 400);
    return reply(route, current);
  });
  return { calls, catalog, tasks, nextRelease: () => { available = { version: 'v3.0.0', commit: nextCommit }; } };
}

async function seed(page: Page, manifests: SkillManifest[], projects: CanvasProject[] = []) {
  await page.goto('/settings');
  await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
  const state = { schema: 2, settings: { ...defaultSettings, showDemoSkills: false }, manifests, projects, activeProjectId: projects[0]?.id || null };
  await page.evaluate(value => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('skill-canvas-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('records', 'readwrite');
      transaction.objectStore('records').put(value, 'app-state');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), state);
  await page.goto('/manage');
  await expect(page.getByRole('heading', { name: 'Skill 管理', exact: true })).toBeVisible();
}

test('需要配置的 Skill 可重新验证，不执行重新安装',async({page})=>{
  const item=manifest();item.runtime.status='needs_configuration';item.runtime.issues=['Codex 未登录'];
  const bridge=await fakeBridge(page,[item]);await seed(page,[item]);
  await page.getByRole('button',{name:'需要配置',exact:true}).click();await expect(page.getByRole('button',{name:'重新验证',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'重新验证',exact:true}).click();await expect(page.getByText('重新验证通过，可以使用。',{exact:true})).toBeVisible();
  expect(bridge.calls.filter(c=>c.action==='revalidate')).toHaveLength(1);expect(bridge.calls.some(c=>c.action==='install')).toBe(false);
  await page.getByRole('button',{name:'已安装',exact:true}).click();await expect(page.locator('.management-row')).toHaveCount(1);
});

test('GitHub 安装先预览、明确选择目录、验证 Manifest、确认作者，再安装', async ({ page }) => {
  const bridge = await fakeBridge(page);
  await page.goto('/manage');
  await page.getByRole('button', { name: '添加 Skill', exact: true }).click();
  await page.getByLabel('原作者仓库地址').fill('https://github.com/test-author/test-poster');
  await page.getByRole('button', { name: '检查来源', exact: true }).click();
  await expect(page.getByLabel('Skill 路径', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '验证所选 Skill', exact: true })).toBeDisabled();
  await expect(page.locator('.skill-install-summary')).toContainText('test-author');
  await expect(page.locator('.skill-install-summary')).toContainText('MIT');
  await page.getByLabel('Skill 路径', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '验证所选 Skill', exact: true }).click();
  await expect(page.locator('.skill-review')).toContainText('兼容性验证通过');
  await expect(page.locator('.skill-review')).toContainText('v1.0.0');
  await expect(page.getByRole('checkbox', { name: /安装后通过 Codex 自动生成/ })).toBeChecked();
  await expect(page.locator('.skill-review')).toContainText('消耗图片额度');
  await expect(page.getByRole('button', { name: '确认安装', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /我已核对作者与仓库/ }).check();
  await page.getByRole('button', { name: '确认安装', exact: true }).click();
  await expect(page.locator('.management-row')).toHaveCount(1);
  await expect(page.locator('.management-row')).toContainText('Management Smoke Poster');
  expect(bridge.calls.map(call => call.action)).toEqual(['preview', 'review', 'install']);
  expect(bridge.calls[1].input).toEqual({ token: 'controlled-preview', path: 'skills/poster' });
  expect(bridge.calls[2].input).toMatchObject({ path: 'skills/poster', trustAuthor: true });
  await expect.poll(() => bridge.tasks.length).toBe(2);
  expect(bridge.tasks.map(task => task.showcase?.role)).toEqual(['cover', 'case']);
  expect(new Set(bridge.tasks.map(task => task.projectId)).size).toBe(2);
  expect(bridge.tasks.every(task => task.skill.id === bridge.catalog[0].id && task.settings.output_count === 1)).toBe(true);
  await page.getByRole('link', { name: 'Management Smoke Poster', exact: true }).click();
  await expect(page.locator('.detail-info')).toContainText('v1.0.0');
  await expect(page.getByLabel('Skill 封面与案例生成').locator('li')).toHaveCount(2);
  await page.reload(); await expect(page.getByLabel('Skill 封面与案例生成').locator('li')).toHaveCount(2);
  expect(bridge.tasks.length).toBe(2); // Restart/scanning does not generate again.
  await page.goto('/projects'); await expect(page.locator('.project-card')).toHaveCount(0);
});

test('本地目录只上传相对路径，显式选根目录后展示实际版本与验证摘要', async ({ page }) => {
  const bridge = await fakeBridge(page);
  await page.goto('/manage');
  await page.getByRole('button', { name: '添加 Skill', exact: true }).click();
  await page.getByRole('button', { name: '本地文件夹', exact: true }).click();
  await page.getByLabel('选择本地 Skill 文件夹', { exact: true }).setInputFiles(path.resolve('tests/fixtures/skills/local-poster'));
  await expect(page.getByLabel('Skill 路径', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '验证所选 Skill', exact: true })).toBeDisabled();
  await page.getByLabel('Skill 路径', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '验证所选 Skill', exact: true }).click();
  await expect(page.locator('.skill-review')).toContainText('v1.0.0');
  await expect(page.locator('.skill-review')).toContainText('local-author');
  await page.getByRole('checkbox', { name: /安装后通过 Codex 自动生成/ }).uncheck();
  await expect(page.getByRole('checkbox', { name: /我已核对作者与仓库/ })).toHaveCount(0);
  await page.getByRole('button', { name: '确认安装', exact: true }).click();
  await expect(page.locator('.management-row')).toHaveCount(1);
  const upload = bridge.calls.find(call => call.action === 'preview')!.input;
  expect(upload.folder).toBe('local-poster');
  const files = upload.files as { path: string; data: string }[];
  expect(files.some(file => file.path === 'SKILL.md')).toBe(true);
  expect(files.every(file => !file.path.startsWith('local-poster/') && !path.isAbsolute(file.path))).toBe(true);
  expect(Buffer.from(files.find(file => file.path === 'SKILL.md')!.data, 'base64').toString()).toContain('Local Poster');
  expect(bridge.calls.find(call => call.action === 'review')!.input.path).toBe('');
  expect(bridge.tasks).toHaveLength(0); // Explicit opt-out means no generation.
});

test('版本检查、跳过、锁定、手动更新与回滚；移除需确认且保留历史提示', async ({ page }) => {
  const installed = manifest(), native = manifest();
  native.id = native.installation.id = 'native-imagegen-smoke'; native.name = 'imagegen'; native.installation.rootId = 'codex-native'; native.source.type = 'official';
  const bridge = await fakeBridge(page, [installed, native]);
  await seed(page, [installed, native]);
  const row = page.locator('.management-row').filter({ has: page.getByRole('link', { name: 'Management Smoke Poster', exact: true }) });
  await row.locator('summary').click();
  await row.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(row).toContainText('v2.0.0');
  await row.getByRole('button', { name: '跳过此版本', exact: true }).click();
  await expect(row.getByRole('button', { name: '安装更新', exact: true })).toBeDisabled();
  await expect(row).toContainText('已跳过此版本');
  await row.getByRole('button', { name: '锁定版本', exact: true }).click();
  await expect(row).toContainText('版本已锁定');
  await row.getByRole('button', { name: '解除锁定', exact: true }).click();
  bridge.nextRelease();
  await row.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(row.getByRole('button', { name: '安装更新', exact: true })).toBeEnabled();
  await row.getByRole('button', { name: '安装更新', exact: true }).click();
  await expect(row.locator(':scope > dl > div').first()).toContainText('v3.0.0');
  await handleDialog(page, dialog => dialog.dismiss());
  await row.getByRole('button', { name: '回滚上一版本', exact: true }).click();
  expect(bridge.calls.filter(call => call.action === 'rollback')).toHaveLength(0);
  await handleDialog(page, dialog => dialog.accept());
  await row.getByRole('button', { name: '回滚上一版本', exact: true }).click();
  await expect(row.locator(':scope > dl > div').first()).toContainText('v1.0.0');
  await handleDialog(page, dialog => dialog.dismiss());
  await row.getByRole('button', { name: '移除 Skill', exact: true }).click();
  expect(bridge.calls.filter(call => call.action === 'remove')).toHaveLength(0);
  await row.getByRole('button', { name: '移除 Skill', exact: true }).click();
  const dialog = page.locator('.app-dialog');
  await expect(dialog).toContainText('历史项目、版本、Prompt 和原始 PNG 文件都会保留');
  await dialog.getByRole('button',{name:'确认',exact:true}).click();
  await expect(row).toHaveCount(0);
  expect(bridge.calls.find(call => call.action === 'remove')!.input.confirm).toBe(true);
  const nativeRow = page.locator('.management-row').filter({ has: page.getByRole('link', { name: 'imagegen', exact: true }) });
  await expect(nativeRow).toBeVisible();
  await expect(nativeRow.getByRole('button', { name: '移除 Skill', exact: true })).toHaveCount(0);
});

test('已更新目录不改变历史工作台与结果的版本、参数名称及执行指令', async ({ page }) => {
  const original = manifest(), current = manifest('v2.0.0', newCommit);
  const projectId = randomUUID(), taskId = randomUUID();
  const draft: Draft = { skillId: original.id, prompt: '历史版本追溯测试', requirements: '保留原版参数', references: [], ratio: '4:5', size: '1024 × 1280', format: 'PNG', count: 1, parameters: { palette: '米白' } };
  const project: CanvasProject = { id: projectId, title: draft.prompt, createdAt: timestamp, updatedAt: timestamp, skillName: original.name, skillSnapshot: original, draft, status: 'completed', generations: [], thumbnail: '/artwork/category-photo.png' };
  const compiled = compileCodexTask(project, original); compiled.taskId = taskId;
  const handle: CodexTaskHandle = { taskId, projectId, threadId: 'historical-thread-fixture', turnId: 'historical-turn-fixture', stage: 'completed', sequence: 10, text: '', instruction: '原版实际执行指令（受控测试）', compiledTask: compiled, workspace: 'test-only', startedAt: timestamp, updatedAt: timestamp, action: 'generate_image', model: 'test-only', result: { taskId, projectId, version: 1, status: 'completed', finalPrompt: '原版最终 Prompt（受控测试）', outputs: [{ id: 'old-output', path: 'test-only.png', format: 'png', width: 100, height: 100, sha256: oldCommit }], metadata: { skillId: original.id, skillVersion: 'v1.0.0', skillCommit: oldCommit, startedAt: timestamp } } };
  const generation: Generation = { id: taskId, projectId, skillName: original.name, draft, status: 'completed', startedAt: Date.parse(timestamp), duration: 1, finalPrompt: handle.result!.finalPrompt!, codex: handle, versions: [{ id: `${taskId}:old-output`, taskId, outputId: 'old-output', label: 'V1', image: '/artwork/category-photo.png' }] };
  project.generations.push(generation);
  await fakeBridge(page, [current]);
  await seed(page, [current], [project]);
  await page.goto('/create');
  await expect(page.locator('.skill-pinned-version')).toContainText('项目绑定 v1.0.0');
  await expect(page.locator('.skill-pinned-version')).toContainText('保持原版本，不随更新切换');
  await expect(page.getByLabel('原版配色', { exact: true })).toHaveValue('米白');
  await expect(page.getByLabel('新版配色', { exact: true })).toHaveCount(0);
  await page.goto(`/result/${taskId}`);
  await expect(page.locator('.result-parameters').first()).toContainText('原版配色');
  await expect(page.locator('.result-parameters').first()).not.toContainText('新版配色');
  await page.locator('.inline-prompt summary').click();
  await expect(page.locator('.inline-prompt .prompt-text')).toContainText('原版最终 Prompt');
  await page.getByText('执行记录与版本追溯', { exact: true }).click();
  await expect(page.locator('.result-parameters').last()).toContainText('v1.0.0');
  await expect(page.locator('.result-parameters').last()).toContainText(oldCommit);
  await page.getByText('最终执行指令（实际发送）', { exact: true }).click();
  await expect(page.getByText('原版实际执行指令（受控测试）', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续修改', exact: true }).click();
  await expect(page.locator('.skill-pinned-version')).toContainText('项目绑定 v1.0.0');
  await expect(page.getByLabel('原版配色', { exact: true })).toHaveValue('米白');
});
