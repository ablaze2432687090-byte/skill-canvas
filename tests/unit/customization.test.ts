import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCustomization,validateCustomization,removePersonalCategory} from '../../src/domain/customization.ts';
import {personalizeSkill} from '../../src/application/customization.ts';
import {toSkillView} from '../../src/application/skillViews.ts';
import {presentationManifest} from '../fixtures/presentation.ts';
test('personal settings have eight output categories plus uncategorized, never style/platform classes',()=>{
 const value=defaultCustomization();assert.equal(value.categories.length,9);assert.ok(value.categories.filter(c=>c.id!=='uncategorized').every(c=>c.name.length===4));assert.deepEqual(validateCustomization(value),value);
});
test('personal display never mutates Skill instructions, identity or version',()=>{
 const manifest=presentationManifest(),before=JSON.stringify(manifest),value=defaultCustomization();value.skills[manifest.id]={translations:{'zh-CN':{name:'Custom',description:'My description'}},categoryId:'brand',notes:'my note',pinned:true};const view=personalizeSkill(toSkillView(manifest,{}),value);assert.equal(view.name,'Custom');assert.equal(view.categoryId,'brand');assert.equal(JSON.stringify(manifest),before);assert.equal(view.manifest?.instructions,manifest.instructions);
});
test('category deletion migrates personal assignments and saved filters, not Skills',()=>{
 const value=defaultCustomization();value.skills.sample={categoryId:'poster'};value.filters=[{id:'saved',name:'Saved',query:'x',categoryId:'poster',favorite:false,tag:'',groupId:''}];const next=removePersonalCategory(value,'poster','brand');assert.equal(next.skills.sample.categoryId,'brand');assert.equal(next.filters[0].categoryId,'brand');assert.equal(value.skills.sample.categoryId,'poster');assert.throws(()=>removePersonalCategory(value,'uncategorized'));
});
test('unknown execution fields, prototype keys, invalid references and unbounded strings are rejected',()=>{
 for(const patch of [{skills:{sample:{instructions:'run'}}},{skills:{sample:{categoryId:'absent'}}},{skills:{sample:{notes:'x'.repeat(4001)}}},{categories:[]},{presets:[{id:'p',name:'p',skillId:'x',fingerprint:'x',parameters:{evil:{nested:true}}}]}])assert.throws(()=>validateCustomization({...defaultCustomization(),...patch}));
 assert.throws(()=>validateCustomization({...defaultCustomization(),skills:JSON.parse('{"__proto__":{}}')}));
});
