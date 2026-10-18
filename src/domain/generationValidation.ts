import type { Draft } from './types';
import type { SkillManifest } from './skill';
import { canvasRatio } from './canvasGeometry.ts';
import { normalizeParameters } from './manifest.ts';

export function validateGenerationDraft(skill: SkillManifest, draft: Draft): string | null {
  if (!draft.prompt.trim()) return '请输入提示词。';
  if (skill.runtime.status !== 'ready') return 'Skill 当前不可用，请到 Skill 管理检查。';
  if (skill.inputs.some(input => input.required && /图片|image|photo/i.test(input.type)) && !draft.references.length && !draft.revision) return '此 Skill 需要参考图，请先上传图片。';
  if (draft.references.some(image => !image.assetId && !image.url)) return '参考图不可用，请重新上传。';
  if (!Number.isInteger(draft.count) || draft.count < 1 || draft.count > 4) return '图片数量必须在 1 到 4 张之间。';
  const size = /^(\d+)\s*[×x]\s*(\d+)$/.exec(draft.size);
  if (size && Math.abs(Number(size[1]) / Number(size[2]) / canvasRatio(draft.ratio) - 1) > .02) return '目标尺寸与画面比例不一致，请重新选择。';
  const normalized = normalizeParameters(skill.parameters, draft.parameters || {});
  if (Object.entries(normalized).some(([id, value]) => draft.parameters?.[id] !== value)) return '部分参数已失效，请恢复 Skill 默认值后重试。';
  if (skill.parameters.some(parameter => parameter.required && String(normalized[parameter.id] ?? '').trim() === '')) return '请填写必需的生成参数。';
  return null;
}
