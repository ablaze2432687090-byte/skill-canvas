import test from 'node:test';
import assert from 'node:assert/strict';
import {rebaseState} from '../../src/application/rebaseState.ts';
test('data location changes only rebase owned cached paths, preserving prompts, source instructions and other roots',()=>{
 const from='C:\\Data\\Skill Canvas Data',to='D:\\Work\\Skill Canvas Data',input={path:from+'\\Projects\\one\\image.png',source:{path:from+'\\Skills\\SKILL.md'},instruction:from+'\\historical execution',prompt:from,requirements:[from],outside:'C:\\Data\\Skill Canvas Data-Other\\image.png'};
 const result=rebaseState(input,from,to);assert.equal(result.path,to+'\\Projects\\one\\image.png');assert.equal(result.source.path,to+'\\Skills\\SKILL.md');assert.equal(result.prompt,from);assert.equal(result.instruction,input.instruction);assert.deepEqual(result.requirements,[from]);assert.equal(result.outside,input.outside);assert.equal(input.path,from+'\\Projects\\one\\image.png');
});
