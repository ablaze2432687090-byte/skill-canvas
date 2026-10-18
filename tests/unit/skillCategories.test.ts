import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryFilter, normalizeSkillCategory, primarySkillCategory, skillCategories, visibleSkillCategories } from '../../src/application/skillCategories.ts';
import { skillPresentation } from '../../src/application/presentation.ts';
import { visualCatalog } from '../../src/application/visualCatalog.ts';
import { visualBatch } from '../../bridge/protocol/visualBatch.ts';
import { presentationManifest } from '../fixtures/presentation.ts';

test('six stable four-character output categories; empty categories stay hidden', () => {
  assert.equal(skillCategories.length, 6);
  assert.ok(skillCategories.every(category => category.length === 4));
  assert.deepEqual(visibleSkillCategories([]), []);
  assert.deepEqual(visibleSkillCategories([{ categories: ['品牌视觉', '海报', '海报设计'] }]), ['海报设计', '品牌视觉']);
  assert.deepEqual(visibleSkillCategories([{ categories: ['3D'] }]), ['三维艺术']);
  assert.deepEqual(visibleSkillCategories([{ categories: ['极简', '复古', '小红书'] }]), []);
});

test('all 31 existing entries have exactly one output category, without mutating source metadata', () => {
  const expected: Record<string, string> = {
    'Minimal Zine Poster': '海报设计', 'Morandi Cinematic Poster': '海报设计',
    'Scene Distillation Zine': '海报设计', 'Gathered Scenes Zine': '海报设计',
    'Mono Color': '海报设计', 'Mondo Poster Design': '海报设计', '营造 · 建筑文化海报': '海报设计',
    'Cover Image': '封面设计', 'XHS Cover': '封面设计',
    'Photo Abstract Editorial': '摄影艺术', 'Travel Photo Abstraction': '摄影艺术',
    'Photo Relic Editorial': '摄影艺术', 'Photo Stamp Archive': '摄影艺术',
    'Fantasy Life Force Portrait': '摄影艺术', 'Portrait Rebuild Light': '摄影艺术',
    'Photo Revival': '艺术插画', 'Travel Memory Sticker Card': '艺术插画',
    'Surreal Pop Collage': '艺术插画', 'TaiT CRT Interface': '艺术插画',
    'IP as Logo': '品牌视觉', '沐阳 · 电影叙事': '艺术插画', '沐阳 · 极简编辑': '艺术插画',
    '沐阳 · 东方诗意': '艺术插画', '沐阳 · 复古版画': '艺术插画', '沐阳 · 柔焦梦幻': '艺术插画',
  };
  const categories: string[] = [];
  for (const entry of visualCatalog) {
    const manifest = presentationManifest('upstream-name');
    manifest.source.repository = entry.repository; manifest.source.skillRoot = entry.root;
    const before = JSON.stringify(manifest), view = skillPresentation(manifest);
    assert.deepEqual(view.displayCategory, [expected[entry.displayName]], entry.displayName);
    assert.equal(JSON.stringify(manifest), before); categories.push(...view.displayCategory);
  }
  for (const entry of visualBatch.filter(entry => entry.name !== 'baoyu-cover-image')) {
    const manifest = presentationManifest(entry.name);
    manifest.source.repository = entry.repository; manifest.source.skillRoot = entry.root;
    manifest.version.commit = entry.commit;
    const category = ['baoyu-infographic', 'baoyu-xhs-images'].includes(entry.name) ? '艺术插画' : '海报设计';
    assert.deepEqual(skillPresentation(manifest).displayCategory, [category]); categories.push(category);
  }
  const native = presentationManifest();
  assert.deepEqual(skillPresentation(native).displayCategory, ['艺术插画']); categories.push('艺术插画');
  assert.equal(categories.length, 31);
  assert.deepEqual(Object.fromEntries(skillCategories.map(category => [category, categories.filter(value => value === category).length])), {
    '海报设计': 10, '封面设计': 2, '摄影艺术': 6, '艺术插画': 12, '品牌视觉': 1, '三维艺术': 0,
  });
});

test('legacy filters and future declarations cannot grow navigation into style/platform tabs', () => {
  assert.equal(categoryFilter('文章封面'), '封面设计');
  assert.equal(categoryFilter('照片风格化'), '摄影艺术');
  assert.equal(categoryFilter('信息图'), '艺术插画');
  assert.equal(categoryFilter('unknown'), '全部');
  assert.equal(normalizeSkillCategory(' 极简 '), undefined);
  const manifest = presentationManifest('new-skill'); manifest.categories = ['复古', '3D', '海报'];
  let before = JSON.stringify(manifest);
  assert.equal(primarySkillCategory(manifest), '三维艺术');
  assert.equal(JSON.stringify(manifest), before);
  manifest.categories = ['极简', '小红书']; before = JSON.stringify(manifest);
  assert.equal(primarySkillCategory(manifest), '未分类');
  assert.equal(JSON.stringify(manifest), before);
});
