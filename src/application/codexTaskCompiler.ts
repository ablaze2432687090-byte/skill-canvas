import type { CanvasProject, Draft } from '../domain/types';
import type { SkillManifest } from '../domain/skill';
import type { CompiledCodexTask } from '../../bridge/protocol/task';
import { codexInstruction } from '../../bridge/protocol/task.ts';
import { normalizeParameters } from '../domain/manifest.ts';
import { batchForSource } from '../../bridge/protocol/visualBatch.ts';
import { executionManifest } from '../../bridge/protocol/executionManifest.ts';

export function compileCodexTask(project: CanvasProject, skill: SkillManifest, draft: Draft = project.draft, action: CompiledCodexTask['action'] = 'generate_image'): CompiledCodexTask {
  skill = project.skillSnapshot?.id === skill.id ? project.skillSnapshot : skill;
  if (!draft.prompt.trim() && action !== 'bridge_test') throw new Error('请输入提示词。');
  const task: CompiledCodexTask = {
    schema: 1, taskId: crypto.randomUUID(), projectId: project.id, action,
    showcase: project.showcase ? structuredClone(project.showcase) : undefined,
    manifest: structuredClone(executionManifest(skill)), revision: draft.revision,
    skill: { id: skill.id, name: skill.name, version: skill.version.installed, commit: skill.version.commit, bundle: skill.version.bundle, path: null, sourcePath: skill.source.path, fingerprint: skill.source.fingerprint, instructions: skill.instructions },
    request: { prompt: draft.prompt, requirements: draft.requirements.split(/\r?\n/).filter(line => line.trim()) },
    images: draft.references.map(image => ({ id: image.id, name: image.name, path: null, mime: image.mime || 'image/png', role: image.role || 'style_reference', assetId: image.assetId, ...(['edit_target', 'subject_reference'].includes(image.role || '') ? { preservation: 'high' as const } : {}) })),
    settings: { aspect_ratio: draft.ratio, output_count: draft.count, size: draft.size },
    extensions: normalizeParameters(skill.parameters, draft.parameters || {}),
    output: { format: draft.format.toLowerCase(), return_final_prompt: true, return_generation_metadata: true }, instruction: '',
  };
  if (task.showcase?.canvas && action === 'generate_image') {
    // Presentation composition is independent of a Skill's supported creative ratios.
    // Archive its valid source values, then give the executor exactly one canvas.
    task.showcase.canvas.source_parameters = { ...task.showcase.canvas.source_parameters, ...Object.fromEntries(Object.entries(task.extensions).filter(([key]) => ['output_ratio', 'output_size', 'output_count'].includes(key))) };
    delete task.extensions.output_ratio; delete task.extensions.output_size; delete task.extensions.output_count;
    task.settings.aspect_ratio = task.showcase.canvas.aspect_ratio;
    task.settings.size = task.showcase.canvas.size;
    task.settings.output_count = 1;
    task.request.requirements.push('这是用户批准的单张展示资产，不是整组社交卡片任务：只制作本条具体主题的一张独立成品，不追加封面或其他页面。源数量选项仅归档，不代表本次输出数量。');
  }
  const selected = batchForSource(skill.source.repository, skill.version.commit, skill.source.skillRoot);
  if (selected && action === 'generate_image') {
    task.request.requirements.push('用户已在工作台确认本任务所列参数并点击生成：直接生成，跳过重复确认。仅使用 Codex 内置 imagegen，禁止切换任何 API 或 CLI 图像后端。只输出 settings.output_count 张正式 PNG。');
    if (selected.name.startsWith('baoyu-')) {
      const language = task.extensions.lang === 'en' ? '英文' : task.extensions.lang === 'zh' ? '中文' : '以本任务用户指定语言为准';
      task.request.requirements.push('首次偏好：' + language + '、无水印、仅当前任务目录。先按 Skill 的偏好 schema，在任务工作目录内的 .baoyu-skills/' + selected.name + '/EXTEND.md 保存用户已确认的本任务参数；不得改写用户级/XDG 设置。后端 auto，优先原生 imagegen。XHS 使用 --yes；信息图使用 --no-confirm；封面使用 --quick。读取所选布局、风格、模板，先保存实际图片 Prompt 文件再生成。');
    }
    if (selected.name === 'baoyu-xhs-images' && !task.showcase?.canvas) task.request.requirements.push(`本任务生成 ${draft.count} 张同风格独立卡片：先生成第一张封面并查看，后续卡片必须把第一张作为风格参考；不要拼成一张联系表，不超出指定数量。`);
  }
  task.instruction = codexInstruction(task); return task;
}
