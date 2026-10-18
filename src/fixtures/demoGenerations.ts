import type { Draft, Generation, ResultVersion } from '../domain/types';
import { art } from './demoSkills.ts';
import { projects } from './demoProjects.ts';

export const defaultDraft: Draft = {
  skillId: 'minimal-zine',
  prompt: '极简风格的海报，红色的抽象形状，黑色现代无衬线字体，留白充足，带有纸张纹理感，艺术展主题。',
  requirements: '干净的排版，现代，艺术感。',
  references: [
    { id: 'architecture', name: '建筑参考', url: art('category-poster') },
    { id: 'flower', name: '花朵参考', url: art('category-photo') },
  ],
  ratio: '4:5', count: 1, size: '1024 × 1280', format: 'PNG',
};
export const mockVersions: ResultVersion[] = ['v1', 'v2', 'v3', 'v4'].map(id => ({ id, label: id.toUpperCase(), image: art(`result-${id}`) }));
const demoDraft: Draft = { ...defaultDraft, count: 4, prompt: '极简杂志海报，女性肖像，红色几何形状，版式设计，胶片质感，艺术印刷风格。' };
export const demoGenerations: Generation[] = [
  { id: 'demo', draft: demoDraft, finalPrompt: demoDraft.prompt, startedAt: 0, duration: 12000, status: 'completed', versions: mockVersions },
  ...projects.map(project => ({
    id: project.id, draft: { ...defaultDraft, skillId: project.skillId, prompt: project.name, count: 1 },
    finalPrompt: project.name, startedAt: 0, duration: 12000, status: 'completed' as const,
    versions: [{ id: 'v1', label: 'V1', image: project.image }],
  })),
];
