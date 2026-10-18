import { demoManifests } from '../../src/application/skillViews.ts';
import { compileCodexTask } from '../../src/application/codexTaskCompiler.ts';
import { defaultDraft } from '../../src/fixtures/demoGenerations.ts';
import type { CanvasProject } from '../../src/domain/types';
import type { SkillManifest } from '../../src/domain/skill';
import type { CodexTaskHandle } from '../../bridge/protocol/task';

// Controlled presentation fixtures only. Never installed or seeded into a real user profile.
export function presentationManifest(name = 'imagegen', id = 'presentation-skill'): SkillManifest {
  const manifest = structuredClone(demoManifests[0]);
  manifest.id = manifest.installation.id = id; manifest.name = name;
  manifest.description = 'A long technical description. '.repeat(30);
  manifest.source = { type: 'local', repository: null, author: 'test fixture', path: 'test-only/SKILL.md', fingerprint: 'a'.repeat(64) };
  manifest.version = { installed: 'v1.0.0', bundle: 'fixture-bundle', latest: null, commit: null, updateStatus: 'unchecked' };
  manifest.installation.installed = true; manifest.installation.rootId = 'test-only';
  manifest.examples = []; manifest.inputs = []; manifest.parameters = []; manifest.categories = ['海报'];
  return manifest;
}
export function presentationProject(manifest: SkillManifest, image = '/artwork/result-v4.png', id = 'presentation-project'): CanvasProject {
  const draft = { ...structuredClone(defaultDraft), skillId: manifest.id, prompt: '用于展示层测试的原始提示词，不可拿作主标题', references: [], parameters: {} };
  const timestamp = '2026-10-03T10:00:00.000Z';
  const project: CanvasProject = { id, title: '未命名作品', createdAt: timestamp, updatedAt: timestamp, skillName: manifest.name, skillSnapshot: manifest, draft, status: 'completed', generations: [], thumbnail: 'reference-must-not-be-cover' };
  const compiled = compileCodexTask(project, manifest, draft); compiled.taskId = id + '-task';
  const handle: CodexTaskHandle = { compiledTask: compiled, taskId: compiled.taskId, projectId: id, threadId: 'test-only-thread', turnId: 'test-only-turn', stage: 'completed', action: 'generate_image', sequence: 1, instruction: 'controlled test', workspace: 'test-only', text: '', startedAt: timestamp, updatedAt: timestamp,
    result: { version: 1, taskId: compiled.taskId, projectId: id, status: 'completed', outputs: [{ id: 'output', path: 'test-only.png', sha256: 'b'.repeat(64), width: 800, height: 1000, format: 'PNG' }], metadata: { skillId: manifest.id, skillVersion: 'v1.0.0', startedAt: timestamp } } };
  project.generations = [{ id: compiled.taskId, projectId: id, skillName: manifest.name, draft, status: 'completed', versions: [{ id: compiled.taskId + ':output', taskId: compiled.taskId, outputId: 'output', label: 'V1', image }], codex: handle, startedAt: Date.parse(timestamp), duration: 0, finalPrompt: 'controlled test' }];
  return project;
}
