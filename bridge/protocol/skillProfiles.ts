import type { SkillManifest, SkillParameterDefinition } from '../../src/domain/skill';

export interface SkillProfile { version: string; inputs: SkillManifest['inputs']; outputs: SkillManifest['outputs']; parameters: SkillParameterDefinition[] }
// Adapters are declarative. The compiler and workbench never branch on skill names.
export const skillProfiles: Record<string, SkillProfile> = {
  imagegen: {
    version: '2',
    inputs: [{ id: 'prompt', label: '创作要求', type: '文本', required: true }, { id: 'references', label: '最多 6 张：编辑原图 / 风格 / 主体 / 构图 / 品牌', type: '图片', required: false }],
    outputs: [{ format: 'PNG', description: '内置 ImageGen 原始 PNG；尺寸以实际生成结果为准' }],
    parameters: [
      { id: 'output_ratio', label: '画面比例', type: 'select', options: ['1:1', '3:4', '4:3', '4:5', '3:2', '2:3', '9:16', '16:9'], default: '1:1' },
      { id: 'output_size', label: '目标尺寸', type: 'select', options: ['1024 × 1024', '2048 × 2048'], default: '1024 × 1024', dependsOn: 'output_ratio', optionsByValue: {
        '1:1': ['1024 × 1024', '2048 × 2048'], '3:4': ['768 × 1024', '1536 × 2048'], '4:3': ['1024 × 768', '2048 × 1536'],
        '4:5': ['1024 × 1280', '1632 × 2040'], '3:2': ['1536 × 1024', '2040 × 1360'], '2:3': ['1024 × 1536', '1360 × 2040'],
        '9:16': ['864 × 1536', '1152 × 2048'], '16:9': ['1536 × 864', '2048 × 1152'],
      } },
      { id: 'output_count', label: '图片数量', type: 'select', options: ['1', '2', '3', '4'], default: '1' },
      { id: 'output_format', label: '输出格式', type: 'select', options: ['PNG'], default: 'PNG' },
      { id: 'preservation', label: '保真要求（指令）', type: 'select', options: ['保留关键特征', '严格保留主体', '保留原始构图', '保留图中文字', '允许重新演绎'], default: '保留关键特征' },
      { id: 'style_strength', label: '风格借鉴（指令）', type: 'select', options: ['轻度', '适中', '鲜明'], default: '适中' },
      { id: 'background', label: '背景', type: 'select', options: ['按提示词', '透明背景', '纯色背景'], default: '按提示词' },
      { id: 'palette', label: '配色要求（可选）', type: 'text', default: '' },
    ],
  },
};
export function adaptSkill(manifest: SkillManifest): SkillManifest {
  const profile = skillProfiles[manifest.name];
  if (!profile) return manifest;
  return { ...manifest, inputs: profile.inputs, outputs: profile.outputs, parameters: profile.parameters, runtime: { ...manifest.runtime, status: 'ready', compatible: true, issues: [] }, installation: { ...manifest.installation, validation: 'valid' } };
}
