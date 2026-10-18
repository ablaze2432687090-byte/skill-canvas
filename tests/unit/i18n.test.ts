import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyLanguage,t,ui,normalizeLanguage} from '../../src/application/i18n.ts';
import {skillPresentation} from '../../src/application/presentation.ts';
import {visualCatalog} from '../../src/application/visualCatalog.ts';
import {visualBatch} from '../../bridge/protocol/visualBatch.ts';
import {presentationManifest} from '../fixtures/presentation.ts';
test('UI translation preserves whitespace and raw interpolated user content',()=>{
 const oldDocument=globalThis.document;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{dataset:{},lang:''}}});
 try {
  applyLanguage('en');assert.equal(t('设置'),'Settings');assert.equal(t(' 查看详情 '),' View details ');
  assert.equal(ui`查看 ${'设置 $& {1}'} 详情`,'View 设置 $& {1} details');
  assert.equal(t('用户原始提示词'),'用户原始提示词');assert.equal(normalizeLanguage('de-DE'),'en');
  applyLanguage('zh-CN');assert.equal(t('设置'),'设置');
 }finally{Object.defineProperty(globalThis,'document',{configurable:true,value:oldDocument});}
});
test('Skill summaries and examples switch language without mutating source manifests',()=>{
 const oldDocument=globalThis.document;Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{dataset:{},lang:''}}});
 try{
  const manifest=presentationManifest();manifest.description='从真实照片提取几何形态，转成克制的极简图形海报。';
  manifest.examples=[{id:'sample',label:'效率工具推荐',imageRef:'cover',beforeRef:null,source:'declared',verified:false}];
  const original=JSON.stringify(manifest);
  applyLanguage('en');const view=skillPresentation(manifest,{cover:'data:image/png;base64,test'});
  assert.match(view.displayDescription,/geometric forms/);assert.equal(view.rawDescription,manifest.description);
  assert.equal(view.examples[0].label,'Productivity Toolkit');assert.equal(view.examples[0].purpose,view.displayDescription);
  for(const item of [...visualCatalog,...visualBatch])assert.doesNotMatch(t(item.description),/[\u3400-\u9fff]/,item.displayName);
  assert.equal(t('原作者风格'),'Upstream style');assert.equal(t('无法确认'),'Unconfirmed');assert.equal(JSON.stringify(manifest),original);
  applyLanguage('zh-CN');assert.equal(skillPresentation(manifest).displayDescription,manifest.description);
 }finally{applyLanguage('zh-CN');Object.defineProperty(globalThis,'document',{configurable:true,value:oldDocument});}
});
