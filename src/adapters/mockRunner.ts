import type { GenerationRunner } from '../ports';
import { mockVersions } from '../fixtures/demoGenerations.ts';
export const mockRunner: GenerationRunner = {
  mode: 'mock',
  createTask(draft, finalPrompt, skill, projectId) {
    const versions = skill.source.type === 'demo' && skill.id === 'minimal-zine'
      ? mockVersions.slice(0, draft.count).map(item => ({ ...item }))
      : Array.from({ length: draft.count }, (_, index) => ({ id: `v${index + 1}`, label: `V${index + 1}`, image: '/artwork/mock-result.svg' }));
    return { id: `mock-${crypto.randomUUID()}`, projectId, skillName: skill.name, draft: structuredClone(draft), finalPrompt, startedAt: Date.now(), duration: 12000, status: 'queued', versions };
  },
  advance(task, now) {
    if (task.codex) return task;
    if (!['queued', 'running'].includes(task.status)) return task;
    const status = now - task.startedAt >= task.duration ? 'completed' : 'running';
    return task.status === status ? task : { ...task, status };
  },
};
