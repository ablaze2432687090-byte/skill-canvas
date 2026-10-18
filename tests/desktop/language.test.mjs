import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
const { normalizeLanguage, translate, initialLanguage, dialogOptions } = createRequire(import.meta.url)('../../desktop/i18n.cjs');
test('only Simplified Chinese and English; other system locales fall back to English', () => {
  assert.equal(normalizeLanguage('zh-TW'), 'zh-CN');
  for(const locale of ['en-US','fr-FR','ja-JP',null])assert.equal(normalizeLanguage(locale),'en');
});
test('saved preference wins; first launch follows installer selection or OS', async () => {
  const execute=async()=>({stdout:'InstallerLanguage    REG_SZ    1033'});
  assert.equal(await initialLanguage({saved:'zh-CN',system:'en',execute,platform:'win32'}),'zh-CN');
  assert.equal(await initialLanguage({system:'zh-CN',execute,platform:'win32'}),'en');
  assert.equal(await initialLanguage({system:'en-US',execute:async()=>({stdout:'InstallerLanguage    REG_SZ    2052'}),platform:'win32'}),'zh-CN');
  assert.equal(await initialLanguage({system:'zh-CN',execute:async()=>{throw Error();},platform:'win32'}),'zh-CN');
});
test('native dialogs translate UI, never file paths or arbitrary values', () => {
  const options={message:'保存原始 PNG',defaultPath:'D:\\作品\\设置.png',buttons:['取消','保存'],custom:'我的提示词'};
  const translated=dialogOptions(options,'en');
  assert.equal(translated.message,'Save original PNG');assert.equal(translated.defaultPath,options.defaultPath);
  assert.deepEqual(translated.buttons,['Cancel','Save']);assert.equal(options.message,'保存原始 PNG');
  assert.equal(translate('unknown raw content','en'),'unknown raw content');
});
test('single NSIS installer includes exactly Chinese and English with a language selector', async () => {
  const config=await readFile('electron-builder.yml','utf8');
  assert.match(config,/installerLanguages:\s*- zh_CN\s*- en_US/);assert.match(config,/displayLanguageSelector: true/);
  assert.match(await readFile('desktop/installer-language.nsh','utf8'),/InstallerLanguage.*\$LANGUAGE/);
});
test('all authored translation calls and task status labels have English resources', async () => {
  const messages={...JSON.parse(await readFile('desktop/locales/en.json','utf8')),...JSON.parse(await readFile('desktop/locales/skill-en.json','utf8'))},missing=[];
  for(const directory of ['src/components','src/pages','src/application'])for(const name of await readdir(directory)){
    if(!/\.tsx?$/.test(name))continue;const file=directory+'/'+name,source=await readFile(file,'utf8'),ast=ts.createSourceFile(file,source,99,true,name.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const check=key=>{if(/[\u3400-\u9fff]/.test(key)&&!messages[key.trim()])missing.push({file,key});};
    function visit(node){
      if(ts.isCallExpression(node)&&node.expression.getText(ast)==='t'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))check(node.arguments[0].text);
      if(ts.isTaggedTemplateExpression(node)&&node.tag.getText(ast)==='ui'&&ts.isTemplateExpression(node.template))check(node.template.head.text+node.template.templateSpans.map((span,i)=>`{${i}}`+span.literal.text).join(''));
      ts.forEachChild(node,visit);
    }visit(ast);
  }
  assert.deepEqual(missing,[]);
  for(const key of ['正在准备输入','正在编译任务','正在连接 Codex','任务已发送','Codex 正在执行','等待在 Codex 中确认执行','已完成','执行失败','已取消','连接或执行已中断'])assert.ok(messages[key],key);
});
