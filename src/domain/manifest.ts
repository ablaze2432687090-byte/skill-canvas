import { parseDocument } from 'yaml';
import type { ParameterValue, SkillDependency, SkillExample, SkillInputDefinition, SkillOutputDefinition, SkillParameterDefinition } from './skill';

export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、]/).map(item => item.trim()).filter(Boolean) : [];
const scalar = (value: unknown) => text(value) || (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
export function safeRepository(value: unknown): string | null {
  try { const url = new URL(text(value)); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function safeRelativePath(value: unknown): string | null {
  const path = text(value).replaceAll('\\', '/').replace(/^\.\//, '');
  return path && !path.startsWith('/') && !path.includes(':') && !path.split('/').some(part => part === '..' || part === '') ? path : null;
}
function section(body: string, names: string) {
  return body.match(new RegExp(`^#{1,6}\\s+(?:${names})\\s*:?\\s*\\r?\\n([\\s\\S]*?)(?=^#{1,6}\\s|$(?![\\s\\S]))`, 'mi'))?.[1]?.trim() || '';
}
function parameters(value: unknown, issues: string[]): SkillParameterDefinition[] {
  const entries = Array.isArray(value) ? value : Object.entries(object(value)).map(([id, item]) => ({ ...object(item), id }));
  const definitions: SkillParameterDefinition[] = [], ids = new Set<string>();
  for (const entry of entries.slice(0, 30)) {
    const item = object(entry), id = text(item.id), label = text(item.label) || id;
    if (!/^[\w-]{1,64}$/.test(id) || ['__proto__', 'prototype', 'constructor'].includes(id) || ids.has(id)) { issues.push('参数 ID 缺失、重复或无效'); continue; }
    ids.add(id);
    const base = { id, label, required: item.required === true };
    if (item.type === 'range' || item.type === 'number') {
      const min = Number(item.min ?? 0), max = Number(item.max ?? 100), step = Number(item.step ?? 1), initial = Number(item.default ?? min);
      if (![min, max, step, initial].every(Number.isFinite) || min > max || step <= 0 || initial < min || initial > max) { issues.push(`参数 ${id} 的范围或默认值无效`); continue; }
      definitions.push({ ...base, type: item.type, min, max, step, default: initial });
    } else if (item.type === 'boolean') definitions.push({ ...base, type: 'boolean', default: item.default === true });
    else if (item.type === 'text') definitions.push({ ...base, type: 'text', default: scalar(item.default) });
    else if (item.type === 'select') {
      const options = list(item.options).map(option => scalar(object(option).value ?? option)).filter(Boolean);
      const initial = scalar(item.default) || options[0];
      if (!options.length || !options.includes(initial)) { issues.push(`参数 ${id} 的选项或默认值无效`); continue; }
      definitions.push({ ...base, type: 'select', options, default: initial });
    } else issues.push(`参数 ${id} 的类型未声明或不支持`);
  }
  if (entries.length > 30) issues.push('参数超过 30 项，请精简 Manifest');
  return definitions;
}
export interface ParsedManifest {
  declaredId: string | null; name: string; description: string; categories: string[];
  version: string | null; commit: string | null; author: string | null; repository: string | null;
  compatible: boolean | null; dependencies: SkillDependency[]; inputs: SkillInputDefinition[];
  outputs: SkillOutputDefinition[]; parameters: SkillParameterDefinition[];
  examplePaths: { label: string; image: string; before: string | null }[];
  instructions: string; issues: string[]; invalid: boolean;
}
export function readSkillManifest(markdown: string, folderName: string, sidecar: unknown = {}): ParsedManifest {
  const issues: string[] = []; let raw: Record<string, unknown> = {}, body = markdown.replace(/^\uFEFF/, ''), invalid = false;
  if (!body.trim() || body.includes('\0')) { issues.push('SKILL.md 为空或不是有效文本'); invalid = true; }
  if (/^---\s*\r?\n/.test(body)) {
    const match = body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    try {
      if (!match) throw new Error('frontmatter 没有结束标记');
      const document = parseDocument(match[1], { uniqueKeys: true });
      if (document.errors.length) throw new Error(document.errors[0].message);
      const parsed: unknown = document.toJS({ maxAliasCount: 30 });
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('frontmatter 必须是字段映射');
      raw = object(parsed); body = body.slice(match[0].length);
    } catch { issues.push('SKILL.md frontmatter 无法解析'); invalid = true; }
  }
  const metadata = object(raw.metadata), local = object(sidecar), runtime = object(raw.runtime), source = object(raw.source);
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const name = text(raw.name) || heading || folderName || '未命名 Skill';
  if (!text(raw.name) && !heading) issues.push('名称未声明，暂用目录名');
  const preamble = body.split(/\r?\n/).filter(line => line.trim() && !/^\s*(#|[-*]|```|\|)/.test(line))[0];
  const description = text(raw.description) || section(body, '简介|描述|用途|Description|Overview') || preamble || '未声明';
  if (description === '未声明') issues.push('用途未声明');
  const declaredId = text(local.id) || text(raw.id) || text(metadata.id) || null;
  if (declaredId && (declaredId.length > 160 || /[\s/\\]/.test(declaredId))) issues.push('Skill ID 格式异常');
  const versionRaw = object(raw.version).installed ?? raw.version ?? local.currentVersion ?? metadata.version;
  const version = scalar(versionRaw) || null;
  if (versionRaw !== undefined && (!version || !/^v?\d+(?:\.\d+){0,2}(?:[-+][\w.-]+)?$/.test(version))) issues.push('版本信息异常');
  const inputValue = raw.inputs ?? raw.input ?? section(body, '输入要求|输入|Inputs?|Input Requirements');
  const inputs: SkillInputDefinition[] = list(inputValue).map((value, index) => ({ id: text(object(value).id) || `input-${index}`, label: text(object(value).label) || text(object(value).type) || text(value), type: text(object(value).type) || text(value) || '未声明', required: object(value).required === true })).filter(item => item.label);
  const outputValue = raw.outputs ?? raw.output ?? section(body, '输出格式|输出|Outputs?');
  const outputs: SkillOutputDefinition[] = list(outputValue).map(value => ({ format: scalar(object(value).format ?? value).replace(/^[-*]\s*/, ''), description: text(object(value).description) })).filter(item => item.format);
  const dependencyValue = raw.dependencies ?? runtime.dependencies ?? section(body, '依赖|Dependencies');
  const dependencies = list(dependencyValue).map((value): SkillDependency => ({ name: text(object(value).name) || text(object(value).path) || text(value), type: object(value).type === 'file' ? 'file' : 'command', required: object(value).required !== false, status: 'unverified' })).filter(item => item.name);
  const examplePaths: ParsedManifest['examplePaths'] = [];
  for (const entry of list(raw.examples)) {
    const example = object(entry), image = safeRelativePath(example.image ?? example.path ?? entry);
    if (!image) { issues.push('案例路径不是 Skill 内的相对路径，未载入'); continue; }
    examplePaths.push({ label: text(example.label) || text(example.title) || 'Skill 提供的案例', image, before: safeRelativePath(example.before) });
  }
  return {
    declaredId, name, description: description.slice(0, 2000), categories: list(raw.categories ?? raw.category ?? metadata.category).map(text).filter(Boolean), version,
    commit: text(local.commit ?? object(raw.version).commit ?? raw.commit) || null,
    author: text(raw.author) || text(object(raw.author).name) || text(source.author) || text(metadata.author) || null,
    repository: safeRepository(source.repository ?? raw.repository ?? metadata.repository ?? (typeof raw.source === 'string' ? raw.source : undefined)),
    compatible: typeof runtime.compatible === 'boolean' ? runtime.compatible : null,
    dependencies, inputs, outputs, parameters: parameters(raw.parameters, issues), examplePaths, instructions: body, issues, invalid,
  };
}
export function parameterDefaults(definitions: SkillParameterDefinition[]): Record<string, ParameterValue> { return Object.fromEntries(definitions.map(definition => [definition.id, definition.default])); }
export function parameterOptions(definition: SkillParameterDefinition, values: Record<string, ParameterValue>): string[] {
  return definition.type === 'select' ? definition.dependsOn && definition.optionsByValue ? definition.optionsByValue[String(values[definition.dependsOn])] || definition.options : definition.options : [];
}
export function normalizeParameters(definitions: SkillParameterDefinition[], values: Record<string, ParameterValue>) {
  const normalized = { ...parameterDefaults(definitions), ...values };
  for (const definition of definitions) {
    const value = normalized[definition.id];
    if (definition.type === 'select') { const options = parameterOptions(definition, normalized); normalized[definition.id] = options.includes(String(value)) ? String(value) : options[0] || definition.default; }
    else if (definition.type === 'range' || definition.type === 'number') normalized[definition.id] = typeof value === 'number' && Number.isFinite(value) ? Math.max(definition.min, Math.min(definition.max, value)) : definition.default;
    else if (definition.type === 'boolean') normalized[definition.id] = typeof value === 'boolean' ? value : definition.default;
    else if (definition.type === 'text') normalized[definition.id] = typeof value === 'string' ? value : definition.default;
  }
  return Object.fromEntries(definitions.map(definition => [definition.id, normalized[definition.id]]));
}
export const declaredExample = (id: string, label: string, imageRef: string, beforeRef: string | null): SkillExample => ({ id, label, imageRef, beforeRef, verified: false, source: 'declared' });
