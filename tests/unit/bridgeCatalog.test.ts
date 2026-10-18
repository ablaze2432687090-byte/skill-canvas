import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBridgeCatalog } from '../../src/application/bridgeCatalog.ts';
import type { SkillManifest } from '../../src/domain/skill.ts';
const skill = (id: string, rootId: string, installed = true, favorite = false) => ({ id, name: id, installation: { id, rootId, installed, favorite } } as SkillManifest);
test('成功刷新后删除旧待安装缓存，不误删本地和历史 Skill', () => {
  const current = [skill('pending-old', 'catalog-pending', false), skill('local', 'folder'), skill('history', 'managed', false)];
  assert.deepEqual(mergeBridgeCatalog(current, [skill('pending-new', 'catalog-pending', false)]).map(skill => skill.id), ['local', 'history', 'pending-new']);
  assert.equal(current.length, 3);
});
test('正式移除状态替代缓存安装状态，同时保留收藏与历史身份', () => {
  const current = [skill('managed-one', 'managed', true, true)], incoming = [skill('managed-one', 'managed', false)];
  const result = mergeBridgeCatalog(current, incoming); assert.equal(result.length, 1);
  assert.equal(result[0].installation.installed, false); assert.equal(result[0].installation.favorite, true);
  assert.equal(incoming[0].installation.favorite, false);
});
test('真实空目录刷新清理待安装项，不用缓存制造已安装项目', () => {
  assert.deepEqual(mergeBridgeCatalog([skill('pending', 'catalog-pending', false)], []), []);
});
