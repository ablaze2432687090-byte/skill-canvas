import type { ParameterValue, SkillManifest, TaskStatus } from './skill';
import type { CodexTaskHandle } from '../../bridge/protocol/task';
export type SkillStatus = 'installed' | 'update' | 'demo' | 'configuration' | 'invalid' | 'unavailable';
export type Category = '海报' | '照片风格化' | '社交媒体' | '信息图' | '漫画' | '演示视觉' | '文章封面';

export interface Skill {
  personal?:import('./customization.ts').SkillOverride;
  categoryId?:string;
  presentation?: import('../application/presentation').SkillPresentation;
  id: string;
  name: string;
  description: string;
  introduction: string;
  categories: string[];
  input: string;
  formats: string[];
  cover: string;
  homeCover?: string;
  before: string;
  after: string;
  examples: string[];
  status: SkillStatus;
  version: string;
  manifest?: SkillManifest;
}

export type ReferenceRole = 'edit_target' | 'style_reference' | 'subject_reference' | 'composition_reference' | 'brand_asset';
export interface ReferenceImage { id: string; name: string; url: string; role?: ReferenceRole; width?: number; height?: number; mime?: string; assetId?: string; projectId?: string }
export interface Draft {
  revision?: { baseTaskId: string; baseOutputId: string; instruction: string };
  skillId: string;
  prompt: string;
  requirements: string;
  references: ReferenceImage[];
  ratio: string;
  count: number;
  size: string;
  format: string;
  parameters?: Record<string, ParameterValue>;
}
export interface ResultVersion { id: string; label: string; image: string; taskId?: string; outputId?: string }
export interface Generation {
  codex?: CodexTaskHandle;
  id: string;
  draft: Draft;
  finalPrompt: string;
  startedAt: number;
  duration: number;
  status: TaskStatus;
  versions: ResultVersion[];
  projectId?: string;
  skillName?: string;
  error?: string;
}
export interface Project { id: string; name: string; image: string; date: string; skillId: string }
export interface CanvasProject {
  customCover?:string|null;
  groupId?:string|null;tags?:string[];
  showcase?: import('../../bridge/protocol/task').ShowcaseAsset;
  showcaseError?: string;
  skillSnapshot?: SkillManifest;
  codexThreadId?: string; codexTurnId?: string;
  id: string; title: string; createdAt: string; updatedAt: string; skillName: string; draft: Draft;
  status: TaskStatus; generations: Generation[]; thumbnail: string | null;
}
