import {test,expect} from '@playwright/test';
import path from 'node:path';
test('Skill instructions stay separate from the creative brief, without invented defaults',async({page})=>{
 await page.goto('/skills/paper-signal');await page.getByRole('button',{name:'使用此 Skill'}).click();
 await expect(page.locator('label[for=prompt]')).toHaveText('你想创作什么？');
 await expect(page.locator('.skill-prompt-guidance')).toContainText('生成时会自动应用此 Skill 的基础指令。');
 await expect(page.getByRole('button',{name:'填入 Skill 示例'})).toHaveCount(0);
 await page.getByLabel('提示词',{exact:true}).fill('My own creative brief');
 await page.getByText('查看 Skill 基础指令',{exact:true}).click();await expect(page.locator('.skill-prompt-guidance pre')).toContainText('内置演示 Skill');
 await expect(page.getByLabel('提示词',{exact:true})).toHaveValue('My own creative brief');
 await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');await page.reload();await expect(page.getByLabel('提示词',{exact:true})).toHaveValue('My own creative brief');
});
test('a declared Skill example inserts only into an empty brief and never overwrites user text',async({page})=>{
 await page.goto('/settings');await page.getByLabel('导入 Skill 目录',{exact:true}).setInputFiles(path.resolve('tests/fixtures/workspace'));await expect(page.locator('.save-indicator')).toHaveText('已保存到本地');
 await page.goto('/skills');await page.getByRole('link',{name:'查看 imagegen 详情',exact:true}).click();await page.getByRole('button',{name:'使用此 Skill'}).click();
 const prompt=page.getByLabel('提示词',{exact:true}),button=page.getByRole('button',{name:'填入 Skill 示例',exact:true});
 await expect(prompt).toBeEmpty();await button.click();await expect(prompt).toHaveValue(/cobalt glass vase/);await expect(button).toBeDisabled();
 await prompt.fill('Keep my own subject');await expect(button).toBeDisabled();await expect(prompt).toHaveValue('Keep my own subject');
 await prompt.clear();await expect(button).toBeEnabled();
});
