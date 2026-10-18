import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasRatio, fitCanvas } from '../../src/domain/canvasGeometry.ts';
import { validateGenerationDraft } from '../../src/domain/generationValidation.ts';
import { applySkillParameters, demoManifests } from '../../src/application/skillViews.ts';
import { defaultDraft } from '../../src/fixtures/demoGenerations.ts';
import { skillProfiles } from '../../bridge/protocol/skillProfiles.ts';

test('canvas supports portrait, landscape and invalid geometry without overflow', () => {
  for (const ratio of ['1:1','3:4','4:3','9:16','16:9','2.35:1','invalid','0:0','1:0']) {
    const value=canvasRatio(ratio), fitted=fitCanvas(value,320,460);
    assert.ok(Number.isFinite(fitted.width)); assert.ok(fitted.width<=320);assert.ok(fitted.height<=460);
    assert.ok(Math.abs(fitted.width/fitted.height-value)<.0001);
  }
});
test('every imagegen ratio has consistent target sizes and independent output count', () => {
  const skill={...structuredClone(demoManifests[0]),parameters:skillProfiles.imagegen.parameters};
  const ratio=skill.parameters.find(p=>p.id==='output_ratio');assert.equal(ratio?.type,'select');
  if(ratio?.type!=='select')return;
  for(const value of ratio.options){
    const draft=applySkillParameters({...structuredClone(defaultDraft),prompt:'Test',references:[],parameters:{output_ratio:value,output_count:'4',output_size:'1024 × 1024'}},skill);
    assert.equal(draft.ratio,value);assert.equal(draft.count,4);assert.equal(validateGenerationDraft(skill,draft),null);
  }
});
test('preflight rejects ratio conflicts, missing images and unavailable skills', () => {
  const skill=structuredClone(demoManifests[0]);const draft=applySkillParameters({...structuredClone(defaultDraft),prompt:'Test',references:[]},skill);
  assert.equal(validateGenerationDraft(skill,draft),null);
  assert.ok(validateGenerationDraft(skill,{...draft,size:'2048 × 2048'}));
  skill.inputs.push({id:'photo',label:'Photo',type:'image',required:true});assert.ok(validateGenerationDraft(skill,draft));
  assert.equal(validateGenerationDraft(skill,{...draft,revision:{baseTaskId:'task',baseOutputId:'output',instruction:'edit'}}),null);
  skill.runtime.status='needs_configuration';assert.ok(validateGenerationDraft(skill,draft));
});
