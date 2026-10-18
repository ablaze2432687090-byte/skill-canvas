import { t } from './i18n.ts';
import type { SkillManifest, SkillParameterDefinition } from '../domain/skill';
import type { CanvasProject, Draft, Skill } from '../domain/types';
import { skillPresentation } from './presentation.ts';
import { normalizeParameters } from '../domain/manifest.ts';
import { skills as fixtures } from '../fixtures/demoSkills.ts';

export const outputParameters: SkillParameterDefinition[] = [
  { id: 'output_ratio', type: 'select', label: '输出比例', options: ['1:1', '3:4', '4:5', '9:16'], default: '4:5' },
  { id: 'output_count', type: 'select', label: '输出数量', options: ['1', '2', '4'], default: '1' },
  { id: 'output_size', type: 'select', label: '输出尺寸', options: ['1024 × 1280', '1632 × 2040'], default: '1024 × 1280', dependsOn: 'output_ratio', optionsByValue: { '1:1': ['1024 × 1024', '2048 × 2048'], '3:4': ['960 × 1280', '1536 × 2048'], '4:5': ['1024 × 1280', '1632 × 2040'], '9:16': ['720 × 1280', '1152 × 2048'] } },
  { id: 'output_format', type: 'select', label: '输出格式', options: ['JPG', 'PNG', 'WEBP'], default: 'PNG' },
];
export const demoManifests: SkillManifest[] = fixtures.filter(item => ['paper-signal', 'minimal-zine', 'editorial-poster'].includes(item.id)).map(skill => ({
  id: skill.id, declaredId: skill.id, name: skill.name, description: skill.description, categories: skill.categories,
  source: { type: 'demo', repository: null, author: null, path: '内置演示', fingerprint: skill.id },
  version: { installed: null, latest: null, commit: null, updateStatus: 'unchecked' },
  runtime: { status: 'ready', compatible: null, dependencies: [], issues: [] },
  inputs: [{ id: 'prompt', label: '提示词', type: '文本', required: true }, { id: 'reference', label: '参考图', type: '图片', required: false }],
  outputs: skill.formats.map(format => ({ format, description: '' })),
  parameters: outputParameters.map(definition => definition.id === 'output_format' ? { ...definition, options: skill.formats } as SkillParameterDefinition : { ...definition }),
  examples: skill.examples.map((image, i) => ({ id: `${i}`, label: '演示案例', imageRef: image, beforeRef: null, source: 'demo', verified: false })),
  installation: { id: skill.id, rootId: 'demo', path: '', installed: false, installedAt: '', updatedAt: '', favorite: false, validation: 'warning', updateStrategy: 'manual', previousVersion: null },
  instructions: '内置演示 Skill，仅用于模拟交互，不代表已安装第三方 Skill。',
}));
export const emptyArtwork = '/artwork/empty.svg';
export function toSkillView(manifest: SkillManifest, assets: Record<string, string>, projects: CanvasProject[] = []): Skill {
  const fixture = manifest.source.type === 'demo' ? fixtures.find(item => item.id === manifest.id) : undefined;
  const url = (reference: string | null) => reference ? assets[reference] || (reference.startsWith('asset:')?reference:'') || (reference.startsWith('/artwork/') ? reference : '') : '';
  const first = manifest.examples[0];
  const presentation = skillPresentation(manifest, assets, projects);
  const status = manifest.source.type === 'demo' ? 'demo' : manifest.runtime.status === 'ready' ? 'installed' : manifest.runtime.status === 'needs_configuration' ? 'configuration' : manifest.runtime.status === 'unavailable' ? 'unavailable' : 'invalid';
  return {
    presentation, id: manifest.installation.id, name: presentation.displayName, description: presentation.displayDescription, introduction: fixture?.introduction ? t(fixture.introduction) : presentation.displayDescription,
    categories: presentation.displayCategory, input: presentation.displayInputCapabilities.join('、'), formats: manifest.outputs.map(output => output.format),
    cover: fixture?.cover || presentation.featuredExample?.image || '',
    homeCover: fixture?.homeCover, before: fixture?.before || url(first?.beforeRef || null), after: fixture?.after || url(first?.imageRef || null),
    examples: presentation.examples.map(example => example.image), status, version: presentation.versionLabel, manifest,
  };
}
export function applySkillParameters(draft: Draft, manifest: SkillManifest): Draft {
  const parameters = normalizeParameters(manifest.parameters, draft.parameters || {});
  return { ...draft, parameters,
    ratio: String(parameters.output_ratio ?? '4:5'), size: String(parameters.output_size ?? 'auto'),
    count: Math.min(4, Math.max(1, Number(parameters.output_count) || 1)), format: String(parameters.output_format ?? 'PNG'),
  };
}
