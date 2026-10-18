import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPreset,insertTemplate} from '../../src/application/reuse.ts';
import {demoManifests} from '../../src/application/skillViews.ts';
import {defaultDraft} from '../../src/fixtures/demoGenerations.ts';
test('presets are bound to Skill identity and source version, with explicit parameter-change evidence',()=>{
 const manifest=structuredClone(demoManifests[0]),preset={id:'preset',name:'Test',skillId:manifest.installation.id,fingerprint:manifest.version.bundle||manifest.source.fingerprint,parameters:Object.fromEntries(manifest.parameters.map(p=>[p.id,p.default]))};
 assert.equal(inspectPreset(preset,manifest).compatible,true);manifest.source.fingerprint='new-version';assert.equal(inspectPreset(preset,manifest).stale,true);manifest.parameters=manifest.parameters.filter(p=>p.id!=='output_ratio');const result=inspectPreset(preset,manifest);assert.equal(result.compatible,false);assert.ok(result.changes.includes('output_ratio: removed'));assert.equal(preset.parameters.output_ratio,'4:5');
});
test('templates append exact user text, and excess size never truncates or replaces the original',()=>{
 const draft={...structuredClone(defaultDraft),prompt:'Original',requirements:'Keep this'},template={id:'template',name:'Text',prompt:'Added',requirements:'Brand requirement'};assert.deepEqual(insertTemplate(draft,template),{prompt:'Original\n\nAdded',requirements:'Keep this\n\nBrand requirement'});assert.equal(draft.prompt,'Original');assert.throws(()=>insertTemplate({...draft,prompt:'x'.repeat(8000)},template),/8000/);
});
