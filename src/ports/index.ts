import type { AppSettings, SkillManifest, SkillRoot } from '../domain/skill';
import type { Draft, Generation } from '../domain/types';
import type { CodexBridge } from '../../bridge/protocol/task';
export interface StorageMutation { key: string; value?: unknown; remove?: boolean }
export interface StorageBridge {
  useNamespace?(id:string,migrateLegacy?:boolean):Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  entries<T>(prefix: string): Promise<[string, T][]>;
  batch(changes: StorageMutation[]): Promise<void>;
}
export interface RootSnapshot { root: SkillRoot; files: Map<string, Blob>; directories: string[]; complete: boolean; error?: string }
export interface SkillFileBridge {
  pickDirectory(): Promise<SkillRoot>;
  importDirectory(files: File[], replaceRootId?: string): Promise<RootSnapshot>;
  scanDirectories(roots: SkillRoot[]): Promise<RootSnapshot[]>;
  requestAccess(root: SkillRoot): Promise<void>;
  forgetRoot(id: string): Promise<void>;
  pickExportDirectory(): Promise<string>;
  saveExport(blob: Blob, name: string): Promise<void>;
}
export interface GenerationRunner {
  readonly mode: 'mock';
  createTask(draft: Draft, prompt: string, skill: SkillManifest, projectId: string): Generation;
  advance(task: Generation, now: number): Generation;
}
export interface AppPorts { storage: StorageBridge; files: SkillFileBridge; runner: GenerationRunner; codex: CodexBridge; defaultCodexMode: 'real' | 'mock' }
export interface PersistedCatalog { settings: AppSettings; manifests: SkillManifest[] }
