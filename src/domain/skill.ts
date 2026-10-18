export type UpdateStrategy = 'manual' | 'notify';
export type SkillRuntimeStatus = 'ready' | 'needs_configuration' | 'invalid' | 'unavailable' | 'incompatible';
export type TaskStatus = 'draft' | 'ready' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface SkillSource { type: 'official' | 'github' | 'local' | 'demo'; repository: string | null; author: string | null; path: string; fingerprint: string; license?: string | null; licenseUrl?: string | null; licenseStatus?: string; localPath?: string; defaultBranch?: string; releaseUrl?: string | null; skillRoot?: string }
export interface SkillVersion { installed: string | null; latest: string | null; commit: string | null; updateStatus: 'unchecked' | 'current' | 'available' | 'locked' | 'skipped'; latestCommit?: string | null; bundle?: string; checkedAt?: string | null }
export interface SkillDependency { name: string; type: 'file' | 'command'; required: boolean; status: 'available' | 'missing' | 'unverified' }
export interface SkillInputDefinition { id: string; label: string; type: string; required: boolean }
export interface SkillOutputDefinition { format: string; description: string }
export type ParameterValue = string | number | boolean;
type ParameterBase = { id: string; label: string; required?: boolean };
export type SkillParameterDefinition = ParameterBase & (
  | { type: 'range' | 'number'; min: number; max: number; step: number; default: number }
  | { type: 'text'; default: string }
  | { type: 'boolean'; default: boolean }
  | { type: 'select'; options: string[]; default: string; dependsOn?: string; optionsByValue?: Record<string, string[]> }
);
export interface SkillExample { id: string; label: string; imageRef: string | null; beforeRef: string | null; verified: false; source: 'declared' | 'demo'; sha256?: string; sourceUrl?: string; skillCommit?: string; recordedAt?: string }
export interface SkillInstallation {
  translations?: Partial<Record<'zh-CN' | 'en', { name?: string; description?: string }>>;
  locked?: boolean; skippedVersion?: string | null; lastError?: string | null;
  executionValidated?: boolean;
  id: string; rootId: string; path: string; installed: boolean; installedAt: string; updatedAt: string;
  updateStrategy: UpdateStrategy; favorite: boolean; validation: 'valid' | 'warning' | 'invalid'; previousVersion: string | null;
}
export interface SkillManifest {
  id: string; declaredId: string | null; name: string; description: string; categories: string[];
  source: SkillSource; version: SkillVersion;
  runtime: { status: SkillRuntimeStatus; compatible: boolean | null; dependencies: SkillDependency[]; issues: string[]; review?: string; python?: string };
  inputs: SkillInputDefinition[]; outputs: SkillOutputDefinition[]; parameters: SkillParameterDefinition[];
  examples: SkillExample[]; installation: SkillInstallation; instructions: string;
}
export interface SkillRoot { id: string; name: string; mode: 'directory' | 'snapshot'; status: 'ready' | 'permission_required' | 'missing' | 'error'; lastScannedAt: string | null; error: string | null }
export interface AppSettings {
  codexMode?: 'real' | 'mock';
  skillRoots: SkillRoot[]; saveLocation: 'browser'; exportFolderName: string | null;
  updateStrategy: UpdateStrategy; theme: 'dark' | 'light' | 'gold' | 'system'; textScale?:number; language: 'zh-CN' | 'en'; showDemoSkills: boolean;
}
export const defaultSettings: AppSettings = { skillRoots: [], saveLocation: 'browser', exportFolderName: null, updateStrategy: 'notify', theme: 'dark', language: 'zh-CN', showDemoSkills: true };
export const statusLabels: Record<TaskStatus, string> = { draft: '草稿', ready: '就绪', queued: '排队中', running: '执行中', completed: '已完成', failed: '失败', cancelled: '已取消' };
