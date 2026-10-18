import test from 'node:test';
import assert from 'node:assert/strict';
import {declaredPromptExample} from '../../src/domain/promptGuidance.ts';
test('only explicit plain-text Skill examples are offered; generic instructions are never a default prompt',()=>{
 assert.equal(declaredPromptExample('# Skill\nUse a premium style.'),null);
 assert.equal(declaredPromptExample('## Examples\n```text\nNot a declared prompt\n```'),null);
 assert.equal(declaredPromptExample('## Example Prompt\n```text\nA cobalt glass vase on limestone.\n```\n## Rules\nDo not copy'), 'A cobalt glass vase on limestone.');
 assert.equal(declaredPromptExample('## 示例提示词\n```prompt\n设计一张音乐节海报\n```'),'设计一张音乐节海报');
 assert.equal(declaredPromptExample('## Example Prompt\n```python\nprint(123)\n```'),null);
 assert.equal(declaredPromptExample('## Example Prompt\n```text\n'+'x'.repeat(8001)+'\n```'),null);
});
