interface DesktopUpdate { status: 'unconfigured'|'idle'|'checking'|'available'|'current'|'downloading'|'downloaded'|'error'|'no_release'; currentVersion: string; version?: string; percent?: number; message: string; manual?:boolean; releasesUrl?:string; releaseNotes?:string }
interface DesktopProbe { status: 'idle'|'running'|'completed'|'failed'|'cancelled'; message: string; threadId?: string; turnId?: string }
interface DesktopEnvironment { codexPath: string; status: {connected: boolean; authenticated: boolean; version?: string; error?: {message:string}}; capabilities: {automaticImageGeneration:boolean; reason:string} }
interface DesktopInfo { dataId?:string;canImportLegacyCache?:boolean; appVersion: string; theme?: 'light'|'dark'|'gold'|'system'; language?: 'zh-CN'|'en'; dataSchemaVersion: number; dataRoot: string; skillRoot: string; logs: string; exportDirectory: string; needsMigration: boolean; legacyWorkspace?: string; startupError?: string; codexPath:string; onboardingComplete:boolean; updates:DesktopUpdate }
interface DesktopSource { type: 'local'; folder: string; files: { path: string; data: string }[] }
interface BackupSchedule {enabled:boolean;hours:24|72|168;keep:1|3|7|14;includeDrafts:boolean;directory?:string;lastSuccess?:string|null;error?:string}
interface Window {
  skillCanvasDesktop?: {
    connection(): Promise<{ base: string; token: string }>;
    info(): Promise<DesktopInfo>;
    setTheme(theme:'light'|'dark'|'gold'|'system'): Promise<'light'|'dark'|'gold'|'system'>;
    setLanguage(language:'zh-CN'|'en'): Promise<'zh-CN'|'en'>;
    translations(): Promise<Record<string,string>>;
    environment(): Promise<DesktopEnvironment>;
    completeSetup(): Promise<boolean>;
    saveSetupStep(step:number): Promise<boolean>;
    setupStep(): Promise<number>;
    diagnostics(): Promise<Record<string,unknown>>;
    exportDiagnostics():Promise<Record<string,unknown>|null>;
    copyDiagnostics(): Promise<Record<string,unknown>>;
    openReleases(): Promise<void>;
    migrateDataLocation():Promise<{source:string;target:string;files:number;bytes:number;originalsPreserved:boolean}|null>;
    reconnectDataLocation():Promise<boolean>;
    onMigration(callback:(progress:{stage:string;completed:number;total:number;copiedBytes:number;totalBytes:number})=>void):()=>void;
    chooseCodex(reset?:boolean): Promise<string|null>;
    officialSetup(): Promise<void>;
    backupData(token?:string): Promise<{path:string;files:number}|null>;
    reportBackupFailure():Promise<boolean>;
    backupSchedule():Promise<BackupSchedule>;
    saveBackupSchedule(value:BackupSchedule&{chooseDirectory?:boolean}):Promise<BackupSchedule>;
    runScheduledBackup(token?:string):Promise<{skipped?:boolean;path?:string;files?:number;removed?:string[]}>;
    restoreData(token?:string): Promise<{path:string;files:number;previous:string|null}|null>;
    beginDraftBackup(state:unknown,assets:string[]):Promise<string>;
    addDraftBackupAsset(token:string,asset:{key:string;data:string}):Promise<{completed:number;total:number}>;
    finishDraftBackup(token:string):Promise<{token:string;assets:number;bytes:number}>;
    cancelDraftBackup(token:string):Promise<void>;
    restoreState(): Promise<{status:'idle'|'running'|'completed'|'failed';message:string;previous?:string|null}>;
    startImageProbe(): Promise<DesktopProbe>;
    imageProbeState(): Promise<DesktopProbe>;
    updateState(): Promise<DesktopUpdate>;
    checkUpdates(): Promise<DesktopUpdate>;
    downloadUpdate(): Promise<DesktopUpdate>;
    installUpdate(): Promise<DesktopUpdate>;
    onUpdate(callback:(state:DesktopUpdate)=>void):()=>void;
    restartBridge(): Promise<boolean>;
    chooseExportDirectory(reset?: boolean): Promise<string | null>;
    pickSkillDirectory(): Promise<DesktopSource | null>;
    savePng(taskId: string, outputId: string, suggestedName?:string): Promise<{ cancelled: boolean; path?: string }>;
    exportProjects(ids:string[]):Promise<{path:string;files:number;projects:number;failures:{id:string;message:string}[]}|null>;
    onExport(callback:(progress:{completed:number;total:number})=>void):()=>void;
    reveal(kind: 'data' | 'logs' | 'skills' | 'project' | 'output' | 'skill', id?: string, outputId?: string): Promise<boolean>;
    onService(callback: (status: { ready: boolean; message?: string }) => void): () => void;
    onBeforeClose(callback: () => Promise<void>): () => void;
  };
}
