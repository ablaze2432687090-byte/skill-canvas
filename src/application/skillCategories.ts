import type { SkillManifest } from '../domain/skill.ts';

// Navigation taxonomy describes the main output, never a style or a platform.
export const skillCategories = ['海报设计', '封面设计', '摄影艺术', '艺术插画', '品牌视觉', '三维艺术'] as const;
export type SkillCategory = typeof skillCategories[number];
const aliases: Record<string, SkillCategory> = {
  '海报': '海报设计', '文章封面': '封面设计', '封面': '封面设计',
  '照片风格化': '摄影艺术', '摄影': '摄影艺术',
  '视觉创作': '艺术插画', '社交媒体': '艺术插画', '社交图文': '艺术插画',
  '信息图': '艺术插画', '漫画': '艺术插画', '演示视觉': '艺术插画', '插画': '艺术插画',
  '品牌': '品牌视觉', 'Logo': '品牌视觉', 'logo': '品牌视觉',
  '3D': '三维艺术', '3d': '三维艺术', '三维': '三维艺术',
};

export function normalizeSkillCategory(value: string | null | undefined): SkillCategory | undefined {
  const label = value?.trim() || '';
  return skillCategories.find(category => category === label) || aliases[label];
}
export function categoryFilter(value: string | null | undefined): SkillCategory | '全部' {
  return normalizeSkillCategory(value) || '全部';
}
export function primarySkillCategory(manifest: SkillManifest, catalogCategory?: string, curatedCategory?: string): SkillCategory | '未分类' {
  const selected = normalizeSkillCategory(catalogCategory);
  if (selected) return selected;
  if (manifest.name.toLowerCase() === 'imagegen' && manifest.source.type !== 'demo') return '艺术插画';
  if (/^(?:gc-)?minimal-zine-poster(?:-v[\d-]+)?$/i.test(manifest.name)) return '海报设计';
  return normalizeSkillCategory(curatedCategory)
    || manifest.categories.map(normalizeSkillCategory).find(category => category !== undefined)
    || '未分类';
}
export function visibleSkillCategories(skills: readonly { categories: readonly string[] }[]): SkillCategory[] {
  const used = new Set(skills.flatMap(skill => skill.categories.map(normalizeSkillCategory)));
  return skillCategories.filter(category => used.has(category));
}
