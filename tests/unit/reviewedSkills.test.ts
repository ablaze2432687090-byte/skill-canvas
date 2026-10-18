import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedProfile, reviewedSkills } from '../../bridge/protocol/reviewedSkills.ts';
test('专项适配仅接受固定来源、名称和完整 bundle；新版本必须重审', () => {
  for (const profile of reviewedSkills) {
    const skill = { name: profile.name, source: { repository: profile.repository }, version: { bundle: profile.bundle } };
    assert.equal(reviewedProfile(skill), profile);
    assert.equal(reviewedProfile({ ...skill, version: { bundle: 'changed' } }), undefined);
    assert.equal(reviewedProfile({ ...skill, source: { repository: 'https://github.com/untrusted/copy' } }), undefined);
    assert.equal(reviewedProfile({ ...skill, name: 'untrusted' }), undefined);
  }
});
test('适配不调用第三方 API，旅行像素保真拼版未通过前不开放', () => {
  assert.equal(reviewedSkills.length, 4);
  assert.equal(reviewedSkills.map(profile => String(profile.name)).includes('travel-photo-abstraction'), false);
  assert.match(reviewedSkills.find(profile => profile.name === 'qiaomu-mondo-poster-design')!.instruction, /禁止运行/);
  assert.match(reviewedSkills.find(profile => profile.python)!.instruction, /只读/);
});
