import path from 'node:path';
import { mkdir, readFile, writeFile, rename, realpath, stat, rm, readdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { BridgeFailure } from '../codex/client.mjs';

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (message, code = 'REFERENCE_FILE_FAILED') => new BridgeFailure(code, message);
export async function replaceRecord(from, to, renameFile = rename) {
  for (let attempt = 0; ; attempt++) {
    try { await renameFile(from, to); return; }
    catch (error) { if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 9) throw error; await new Promise(resolve => setTimeout(resolve, Math.min(25 * 2 ** attempt, 250))); }
  }
}
export const digest = data => createHash('sha256').update(data).digest('hex');
export function within(root, target) { const relative = path.relative(root, target); return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative); }
export function validatePayload(task, references) {
  if (task?.schema !== 1 || !uuid.test(task.taskId) || !uuid.test(task.projectId) || !['generate_image', 'bridge_test'].includes(task.action)) throw failure('任务结构或身份无效。');
  if (!task.skill || typeof task.skill.name !== 'string' || typeof task.skill.id !== 'string' || typeof task.skill.instructions !== 'string' || task.skill.instructions.length > 1048576) throw failure('Skill 描述无效。');
  if (typeof task.request?.prompt !== 'string' || task.request.prompt.length > 8000 || !Array.isArray(task.request.requirements) || task.request.requirements.some(item => typeof item !== 'string' || item.length > 8000)) throw failure('用户输入无效。');
  if (!Array.isArray(task.images) || task.images.length > 6 || !Array.isArray(references) || references.length !== task.images.length) throw failure('参考图数量不匹配。');
  if (!Number.isInteger(task.settings?.output_count) || task.settings.output_count < 1 || task.settings.output_count > 4 || typeof task.settings.aspect_ratio !== 'string' || task.settings.aspect_ratio.length > 16) throw failure('输出参数无效。');
  if (typeof task.output?.format !== 'string' || !task.extensions || Array.isArray(task.extensions) || Object.values(task.extensions).some(value => !['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value))) throw failure('参数扩展或输出格式无效。');
  if (task.revision && (!uuid.test(task.revision.baseTaskId) || !/^[\w-]{1,80}$/.test(task.revision.baseOutputId) || typeof task.revision.instruction !== 'string' || task.revision.instruction.length > 8000)) throw failure('续改版本信息无效。');
  if (task.showcase && (task.showcase.schema !== 1 || !uuid.test(task.showcase.setId) || !['cover', 'case'].includes(task.showcase.role) || !Number.isInteger(task.showcase.ordinal) || task.showcase.ordinal < 0 || task.showcase.ordinal > 3 || (task.showcase.role === 'cover') !== (task.showcase.ordinal === 0) || ['label', 'purpose'].some(key => typeof task.showcase[key] !== 'string' || !task.showcase[key].trim() || task.showcase[key].length > 500) || task.settings.output_count !== 1 || task.action !== 'generate_image')) throw failure('Skill 案例元数据无效。');
  if (task.showcase?.canvas !== undefined) {
    const canvas = task.showcase.canvas, source = canvas?.source_parameters;
    if (!canvas || canvas.schema !== 1 || canvas.aspect_ratio !== '3:4' || canvas.size !== '1536 × 2048' || !['native', 'recompose'].includes(canvas.composition) || !source || typeof source !== 'object' || Array.isArray(source) || Object.entries(source).some(([key, value]) => !['output_ratio', 'output_size', 'output_count'].includes(key) || !['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 100 || typeof value === 'number' && !Number.isFinite(value)) || task.settings.aspect_ratio !== canvas.aspect_ratio || task.settings.size !== canvas.size || task.output.format !== 'png' || 'output_ratio' in task.extensions || 'output_size' in task.extensions || 'output_count' in task.extensions && ![1, '1'].includes(task.extensions.output_count)) throw failure('Skill 展示画布须唯一指定竖向 3:4；源尺寸选项只能保存在展示元数据中。');
  }
  const ids = new Set();
  for (const image of task.images) {
    if (!uuid.test(image.id) || ids.has(image.id) || !['edit_target', 'style_reference', 'subject_reference', 'composition_reference', 'brand_asset'].includes(image.role) || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mime)) throw failure('参考图身份、角色或格式无效。');
    ids.add(image.id);
    if (references.filter(ref => ref.id === image.id && typeof ref.data === 'string').length !== 1) throw failure('参考图文件缺失或重复。');
  }
}
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
export function validatePng(data) {
  if (data.length < 45 || data.length > 32 * 1024 * 1024 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw failure('输出不是有效 PNG。', 'TURN_FAILED');
  let offset = 8, width = 0, height = 0, channels = 0, end = false; const compressed = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8);
    if (length > 32 * 1024 * 1024 || offset + length + 12 > data.length) throw failure('PNG 数据被截断。', 'TURN_FAILED');
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (crc32(data.subarray(offset + 4, offset + 8 + length)) !== data.readUInt32BE(offset + 8 + length)) throw failure('PNG 校验失败。', 'TURN_FAILED');
    if (offset === 8 && type !== 'IHDR') throw failure('PNG 缺少图像头。', 'TURN_FAILED');
    if (type === 'IHDR') {
      if (width || length !== 13) throw failure('PNG 图像头无效。', 'TURN_FAILED');
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[chunk[9]] || 0;
      if (!width || !height || width > 8192 || height > 8192 || width * height > 32000000 || chunk[8] !== 8 || !channels || chunk[10] || chunk[11] || chunk[12]) throw failure('当前 PoC 只接收合理尺寸、8 位、非交错的灰度/RGB/RGBA PNG。', 'TURN_FAILED');
    } else if (type === 'IDAT') compressed.push(chunk);
    else if (type === 'IEND') { if (length) throw failure('PNG 结束标记无效。', 'TURN_FAILED'); end = true; offset += 12; break; }
    offset += length + 12;
  }
  if (!end || offset !== data.length || !compressed.length) throw failure('PNG 内容不完整。', 'TURN_FAILED');
  const stride = width * channels + 1, expected = stride * height;
  let pixels; try { pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected }); } catch { throw failure('PNG 压缩像素损坏。', 'TURN_FAILED'); }
  if (pixels.length !== expected) throw failure('PNG 像素长度错误。', 'TURN_FAILED');
  for (let row = 0; row < height; row++) if (pixels[row * stride] > 4) throw failure('PNG 像素滤镜无效。', 'TURN_FAILED');
  return { width, height };
}
export class TaskWorkspaces {
  constructor(root) { this.root = path.resolve(root); this.queues = new Map(); }
  directory(id) { if (!uuid.test(id)) throw failure('任务 ID 无效。'); return path.join(this.root, id); }
  async save(record) {
    const target = this.directory(record.taskId), snapshot = JSON.stringify(record, null, 2);
    const operation = (this.queues.get(record.taskId) || Promise.resolve()).catch(() => {}).then(async () => {
      await mkdir(target, { recursive: true });
      if (!within(await realpath(this.root), await realpath(target))) throw failure('任务目录越界。');
      const temporary = path.join(target, `record-${randomUUID()}.tmp`);
      await writeFile(temporary, snapshot, { flag: 'wx' });
      try { await replaceRecord(temporary, path.join(target, 'record.json')); }
      finally { await rm(temporary, { force: true }).catch(() => {}); }
    });
    this.queues.set(record.taskId, operation); await operation;
  }
  async all() {
    await mkdir(this.root, { recursive: true }); const values = [];
    for (const entry of await readdir(this.root, { withFileTypes: true })) if (entry.isDirectory() && uuid.test(entry.name)) {
      const target = this.directory(entry.name); if (!within(await realpath(this.root), await realpath(target))) continue;
      try { const record = JSON.parse(await readFile(path.join(target, 'record.json'), 'utf8')); if (record.taskId === entry.name) values.push(record); } catch { /* Corrupt records are not executed. */ }
    }
    return values;
  }
  async prepare(task, references) {
    validatePayload(task, references); const workspace = this.directory(task.taskId);
    await mkdir(this.root, { recursive: true }); await mkdir(workspace); // no overwrite / ID reuse
    if (!within(await realpath(this.root), await realpath(workspace))) throw failure('任务目录越界。');
    await mkdir(path.join(workspace, 'input')); await mkdir(path.join(workspace, 'output'));
    for (const [index, image] of task.images.entries()) {
      const upload = references.find(ref => ref.id === image.id);
      const limit = image.origin === 'base_version' ? 32 : 8;
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data) || upload.data.length > limit * 1.5 * 1024 * 1024) throw failure('参考图编码或大小无效。');
      const buffer = Buffer.from(upload.data, 'base64');
      if (!buffer.length || buffer.length > limit * 1024 * 1024) throw failure(`参考图超过 ${limit} MB。`);
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.mime];
      const valid = extension === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : extension === 'jpg' ? buffer[0] === 255 && buffer[1] === 216 : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!valid) throw failure('参考图内容与格式不匹配。');
      image.path = path.join(workspace, 'input', `${index + 1}-${image.role}.${extension}`); delete image.assetId; delete image.sha256;
      await writeFile(image.path, buffer, { flag: 'wx' });
    }
    return workspace;
  }
  async output(record, output) {
    if (output.format !== 'png' || typeof output.path !== 'string' || !/^[\w-]{1,80}$/.test(output.id)) throw failure('输出格式或 ID 无效。', 'TURN_FAILED');
    const outputRoot = await realpath(path.join(this.directory(record.taskId), 'output'));
    if (!within(await realpath(this.directory(record.taskId)), outputRoot) || !within(await realpath(this.root), outputRoot)) throw failure('输出目录越界。', 'TURN_FAILED');
    const candidate = await realpath(output.path).catch(() => { throw failure('Codex 声明的输出文件不存在。', 'TURN_FAILED'); });
    if (!within(outputRoot, candidate)) throw failure('输出文件不在当前任务的 output 目录中。', 'TURN_FAILED');
    const info = await stat(candidate); if (!info.isFile() || info.size > 32 * 1024 * 1024) throw failure('输出文件不可读取或过大。', 'TURN_FAILED');
    const data = await readFile(candidate), dimensions = validatePng(data);
    return { id: output.id, path: candidate, format: 'png', ...dimensions, sha256: digest(data) };
  }
  async validateResult(record, value) {
    if (value?.status !== 'completed' || !Array.isArray(value.outputs) || !value.outputs.length || value.outputs.length > 4 || !value.finalPrompt?.trim()) throw failure(value?.error || '结构化结果缺失图片或实际最终 Prompt。', 'TURN_FAILED');
    if (new Set(value.outputs.map(item => item.id)).size !== value.outputs.length) throw failure('输出 ID 重复。', 'TURN_FAILED');
    const outputs = []; for (const output of value.outputs) outputs.push(await this.output(record, output));
    // Existing outputs keep their original contract. New showcases must actually
    // match the portrait canvas; never modify source PNG bytes to make them pass.
    if (record.payload.showcase?.canvas) {
      const mismatch = outputs.find(output => Math.abs(output.width * 4 - output.height * 3) > 4);
      if (mismatch) throw failure(`展示图实际尺寸为 ${mismatch.width} × ${mismatch.height}，未符合竖向 3:4。原文件已保留，请重试并重新构图；不会拉伸、裁切或覆盖旧案例。`, 'OUTPUT_ASPECT_RATIO_MISMATCH');
    }
    return { taskId: record.taskId, projectId: record.projectId, status: 'completed', outputs, finalPrompt: value.finalPrompt, metadata: { skillId: record.payload.skill.id, skillVersion: record.payload.skill.version || undefined, skillCommit: record.payload.skill.commit || null, model: record.model, startedAt: record.startedAt, completedAt: new Date().toISOString() } };
  }
  async remove(id) {
    await this.queues.get(id)?.catch(() => {});
    const target = this.directory(id), resolved = await realpath(target);
    if (!within(await realpath(this.root), resolved) || path.basename(resolved) !== id) throw failure('拒绝清理越界目录。');
    await rm(resolved, { recursive: true }); this.queues.delete(id);
  }
}
