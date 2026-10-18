import type { RootSnapshot, SkillFileBridge, StorageBridge } from '../ports';
import type { SkillRoot } from '../domain/skill';

interface DirectoryHandle {
  kind: 'directory'; name: string;
  values(): AsyncIterableIterator<DirectoryHandle | FileHandle>;
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandle>;
}
interface FileHandle { kind: 'file'; name: string; getFile(): Promise<File>; createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void> }> }
type PickerWindow = Window & { showDirectoryPicker?: (options: { mode: 'read' | 'readwrite'; id: string }) => Promise<DirectoryHandle> };
const skippedDirectories = new Set(['.git', 'node_modules', '.cache', '.tmp']);
const rootRecord = (name: string, mode: SkillRoot['mode']): SkillRoot => ({ id: crypto.randomUUID(), name, mode, status: 'ready', error: null, lastScannedAt: null });

export class BrowserSkillFiles implements SkillFileBridge {
  private handles = new Map<string, DirectoryHandle>();
  private exportHandle?: DirectoryHandle;
  private storage: StorageBridge;
  constructor(storage: StorageBridge) { this.storage = storage; }
  private picker() {
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) throw new Error('此浏览器不支持持续目录授权，请使用“导入目录快照”。');
    return picker.bind(window);
  }
  async pickDirectory() {
    const handle = await this.picker()({ mode: 'read', id: 'skill-canvas-roots' });
    const root = rootRecord(handle.name, 'directory');
    this.handles.set(root.id, handle);
    await this.storage.set(`handle:${root.id}`, handle);
    return root;
  }
  async requestAccess(root: SkillRoot) {
    if (root.mode === 'snapshot') throw new Error('目录快照需要重新选择同一个目录以刷新。');
    const handle = this.handles.get(root.id) || await this.storage.get<DirectoryHandle>(`handle:${root.id}`);
    if (handle) this.handles.set(root.id, handle);
    if (!handle || await handle.requestPermission({ mode: 'read' }) !== 'granted') throw new Error('未获得目录读取权限，请重新选择目录。');
  }
  async importDirectory(files: File[], replaceRootId?: string) {
    if (!files.length) throw new Error('目录为空或未选择文件。');
    if (files.length > 10000) throw new Error('目录超过 10000 个文件，请选择更小的 Skill 根目录。');
    const name = files[0].webkitRelativePath.split('/')[0] || '本地 Skill';
    const root = { ...rootRecord(name, 'snapshot'), ...(replaceRootId ? { id: replaceRootId } : {}) };
    const mapped = new Map<string, Blob>();
    const directories = new Set<string>(['']);
    for (const file of files) {
      const path = file.webkitRelativePath.split('/').slice(1).join('/') || file.name;
      if (path.split('/').some(part => skippedDirectories.has(part))) continue;
      mapped.set(path, file);
      const parts = path.split('/');
      for (let depth = 1; depth < parts.length; depth++) directories.add(parts.slice(0, depth).join('/'));
    }
    // Store only the catalog, never the entire third-party directory snapshot.
    return { root, files: mapped, directories: [...directories], complete: true };
  }
  async scanDirectories(roots: SkillRoot[]): Promise<RootSnapshot[]> {
    return Promise.all(roots.map(async root => {
      const snapshot: RootSnapshot = { root, files: new Map(), directories: [''], complete: true };
      if (root.mode === 'snapshot') return { ...snapshot, complete: false, error: '这是目录快照，请重新导入目录以检查变化。' };
      try {
        const handle = this.handles.get(root.id) || await this.storage.get<DirectoryHandle>(`handle:${root.id}`);
        if (!handle) throw new Error('目录句柄不存在，请重新选择目录。');
        this.handles.set(root.id, handle);
        if (await handle.queryPermission({ mode: 'read' }) !== 'granted') throw new Error('目录读取权限已失效，请重新授权。');
        let count = 0;
        const walk = async (directory: DirectoryHandle, path: string, depth: number): Promise<void> => {
          if (depth > 10) throw new Error('目录层级超过 10 层，请选择更精确的根目录。');
          for await (const entry of directory.values()) {
            if (++count > 10000) throw new Error('目录超过 10000 个条目，请缩小扫描范围。');
            const relative = [path, entry.name].filter(Boolean).join('/');
            if (entry.kind === 'directory') {
              if (!skippedDirectories.has(entry.name)) { snapshot.directories.push(relative); await walk(entry, relative, depth + 1); }
            } else snapshot.files.set(relative, await entry.getFile());
          }
        };
        await walk(handle, '', 0);
      } catch (error) { snapshot.complete = false; snapshot.error = error instanceof Error ? error.message : '无法读取目录。'; }
      return snapshot;
    }));
  }
  async forgetRoot(id: string) { this.handles.delete(id); await this.storage.remove(`handle:${id}`); }
  async pickExportDirectory() {
    const handle = await this.picker()({ mode: 'readwrite', id: 'skill-canvas-export' });
    await this.storage.set('export-handle', handle); this.exportHandle = handle; return handle.name;
  }
  async saveExport(blob: Blob, name: string) {
    const handle = this.exportHandle || await this.storage.get<DirectoryHandle>('export-handle');
    if (!handle || await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('导出目录需要重新授权，请到设置重新选择保存位置。');
    // Unique suffix prevents silently overwriting an existing export.
    const filename = `${name.replace(/\.png$/i, '')}-${crypto.randomUUID().slice(0, 8)}.png`;
    const file = await handle.getFileHandle(filename, { create: true });
    const writable = await file.createWritable(); await writable.write(blob); await writable.close();
  }
}
