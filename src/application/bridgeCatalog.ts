import type { SkillManifest } from '../domain/skill.ts';

// Pending entries are a live Bridge catalog, not historical Skill installations.
// Remove stale cached entries after a successful refresh; callers must preserve
// the cache on connection failures rather than treating a failed fetch as empty.
export function mergeBridgeCatalog(current: SkillManifest[], catalog: SkillManifest[]): SkillManifest[] {
  const ids = new Set(catalog.map(skill => skill.installation.id));
  const existing = new Map(current.map(skill => [skill.installation.id, skill]));
  return [
    ...current.filter(skill => skill.installation.rootId !== 'catalog-pending' && !ids.has(skill.installation.id)),
    ...catalog.map(skill => ({ ...skill, installation: { ...skill.installation, favorite: existing.get(skill.installation.id)?.installation.favorite || false } })),
  ];
}
