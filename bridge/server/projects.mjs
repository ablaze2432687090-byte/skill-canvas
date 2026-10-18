import path from 'node:path';
import { mkdir, readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { uuid, digest, validatePng, within, replaceRecord } from './workspace.mjs';
import { BridgeFailure } from '../codex/client.mjs';

// Project files, not task workspaces, own the durable originals and audit history.
export class ProjectStore {
  constructor(root) { this.root = path.resolve(root); this.queues = new Map(); }
  directory(id) { if (!uuid.test(id)) throw new Error('项目 ID 无效。'); return path.join(this.root, id); }
  async file(id, relative) {
    const directory = this.directory(id), target = path.resolve(directory, relative);
    if (!within(directory, target)) throw new Error('项目文件越界。');
    await mkdir(this.root, { recursive: true });
    const resolvedRoot = await realpath(this.root);
    let current = this.root;
    for (const part of path.relative(this.root, path.dirname(target)).split(path.sep)) {
      current = path.join(current, part); await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const resolved = await realpath(current);
      if (!within(resolvedRoot, resolved) || (current !== directory && !within(await realpath(directory), resolved))) throw new Error('项目目录越界。');
    }
    const existing = await realpath(target).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (existing && !within(await realpath(directory), existing)) throw new Error('项目文件越界。');
    return target;
  }
  async read(id) {
    try { return JSON.parse(await readFile(await this.file(id, 'metadata/project.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { id, schema: 1, tasks: [], versions: [] }; throw error; }
  }
  async transact(id, action) {
    const operation = (this.queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
      const project = await this.read(id), result = await action(project);
      const target = await this.file(id, 'metadata/project.json'), temporary = await this.file(id, `metadata/${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(project, null, 2), { flag: 'wx' });
      await replaceRecord(temporary, target); return result;
    });
    this.queues.set(id, operation); return operation;
  }
  async all() {
    await mkdir(this.root, { recursive: true }); const projects = [];
    for (const item of await readdir(this.root, { withFileTypes: true })) {
      if (item.isDirectory() && uuid.test(item.name)) projects.push(await this.read(item.name));
    }
    return projects;
  }
  async record(task) {
    if (task.action !== 'generate_image') return;
    const snapshot = structuredClone(task);
    await this.transact(task.projectId, async project => {
      // Store a separate immutable reference copy for every submitted task.
      const previous = project.tasks.find(item => item.taskId === task.taskId);
      if (previous && previous.sequence > snapshot.sequence) return;
      for (const image of snapshot.payload.images) {
        const stored = previous?.payload.images.find(item => item.id === image.id);
        if (stored?.sha256) { image.path = stored.path; image.sha256 = stored.sha256; continue; }
        const target = await this.file(task.projectId, `input/${task.taskId}/${image.id}.${image.mime === 'image/jpeg' ? 'jpg' : image.mime === 'image/webp' ? 'webp' : 'png'}`);
        {
          const bytes = await readFile(image.path);
          image.sha256 = digest(bytes);
          await writeFile(target, bytes, { flag: 'wx' }).catch(async error => { if (error.code !== 'EEXIST' || digest(await readFile(target)) !== image.sha256) throw error; });
        }
        image.path = target;
      }
      // The live payload keeps temporary input paths; the archived payload is independently replayable.
      project.tasks = [...project.tasks.filter(item => item.taskId !== task.taskId), snapshot];
      project.updatedAt = task.updatedAt;
      project.threadId = task.threadId || project.threadId;
    });
  }
  async publish(task, result) {
    return this.transact(task.projectId, async project => {
      if (!project.tasks.some(item => item.taskId === task.taskId)) throw new Error('任务尚未正式记录，不能发布版本。');
      const existing = project.versions.find(version => version.taskId === task.taskId);
      if (existing) return existing;
      const number = project.versions.length + 1, outputs = [];
      for (const output of result.outputs) {
        const bytes = await readFile(output.path); validatePng(bytes);
        if (digest(bytes) !== output.sha256) throw new Error('正式保存前 PNG 校验失败。');
        const target = await this.file(task.projectId, `versions/V${number}/${task.taskId}/${output.id}.png`);
        await writeFile(target, bytes, { flag: 'wx' }).catch(async error => { if (error.code !== 'EEXIST' || digest(await readFile(target)) !== output.sha256) throw error; });
        outputs.push({ ...output, path: target });
      }
      const version = { ...result, outputs, version: number, metadata: { ...result.metadata, skillFingerprint: task.payload.skill.fingerprint, threadId: task.threadId, turnId: task.turnId } };
      project.versions.push(version);
      const stored = project.tasks.find(item => item.taskId === task.taskId);
      Object.assign(stored, { stage: 'completed', result: version, error: undefined, threadId: task.threadId, turnId: task.turnId, instruction: task.instruction, sawImageGeneration: task.sawImageGeneration });
      return version;
    });
  }
  async bytes(projectId, candidate, hash) {
    const directory = await realpath(this.directory(projectId)).catch(() => { throw new BridgeFailure('REFERENCE_FILE_FAILED', '正式项目目录不存在，请恢复目录后重试。'); });
    const target = await realpath(candidate).catch(() => { throw new BridgeFailure('REFERENCE_FILE_FAILED', '项目原始文件不存在，请恢复文件后重试。'); });
    if (!within(await realpath(this.root), directory) || !within(directory, target)) throw new Error('项目文件越界。');
    const bytes = await readFile(target);
    if (!hash || digest(bytes) !== hash) throw new BridgeFailure('REFERENCE_FILE_FAILED', '项目原始文件 Hash 不一致，拒绝使用。');
    return bytes;
  }
  async archive(id) { await this.transact(id, project => { project.archived = true; }); }
}
