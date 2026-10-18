import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile('public/theme-init.js','utf8');
test('黑金主题首帧保留，并为原生控件使用 dark',()=>{const document={documentElement:{dataset:{},style:{}}};vm.runInNewContext(script,{document,localStorage:{getItem:()=> 'gold'}});assert.equal(document.documentElement.dataset.theme,'gold');assert.equal(document.documentElement.style.colorScheme,'dark');});
test('首帧使用已保存的正常模式，不等待 React 或 IndexedDB',()=>{const document={documentElement:{dataset:{},style:{}}};vm.runInNewContext(script,{document,localStorage:{getItem:()=> 'light'}});assert.equal(document.documentElement.dataset.theme,'light');assert.equal(document.documentElement.style.colorScheme,'light');});
test('桌面持久主题优先于过时缓存，存储不可用时仍可启动',()=>{const document={documentElement:{dataset:{theme:'light'},style:{}}};vm.runInNewContext(script,{document,localStorage:{getItem:()=>{throw Error('blocked');}}});assert.equal(document.documentElement.dataset.theme,'light');const empty={documentElement:{dataset:{},style:{}}};vm.runInNewContext(script,{document:empty,localStorage:{getItem:()=>{throw Error('blocked');}}});assert.equal(empty.documentElement.dataset.theme,'dark');});
