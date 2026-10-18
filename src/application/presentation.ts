import { getLanguage, t, ui, skillText } from './i18n.ts';
import type { SkillManifest } from '../domain/skill.ts';
import type { CanvasProject } from '../domain/types.ts';
import { batchForSource, visualBatch } from '../../bridge/protocol/visualBatch.ts';
import { visualCatalogEntry } from './visualCatalog.ts';
import { primarySkillCategory } from './skillCategories.ts';

export type ExampleSource = 'repository' | 'author' | 'local_verified' | 'generated_showcase' | 'demo' | 'personal_upload';
export interface SkillExampleView {
  id: string; image: string; label: string; exampleSource: ExampleSource; verified: boolean;
  skillId: string; skillVersion: string | null; projectId?: string; taskId?: string; outputId?: string;
  sha256?: string; width?: number; height?: number; sourceUrl?: string; skillCommit?: string; recordedAt?: string;
  purpose?: string; finalPrompt?: string; role?: 'cover' | 'case'; ordinal?: number;
}
export interface SkillPresentation {
  rawId: string; rawName: string; rawDescription: string;
  displayName: string; displayDescription: string; displayCategory: string[];
  displayInputCapabilities: string[]; displayStatus: '可用' | '待验证' | '需要配置' | '暂不可用' | '未安装';
  versionLabel: string; examples: SkillExampleView[]; featuredExample?: SkillExampleView;
}

export function displaySkillName(name: string) {
  name = name.trim();
  if (!name) return t('视觉创作 Skill');
  const curated = visualBatch.find(item => item.name === name); if (curated) return t(curated.displayName);
  if (name.toLowerCase() === 'imagegen') return 'imagegen';
  if (/^(?:gc-)?minimal-zine-poster(?:-v[\d-]+)?$/i.test(name)) return 'Minimal Zine Poster';
  if (name.includes('-') || name.includes('_')) return name.replace(/[-_]v\d+(?:[-_.]\d+)*$/i, '').replace(/^gc[-_]/, '').replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase());
  return name;
}
export function versionLabel(manifest?: SkillManifest) {
  const version = manifest?.version.installed;
  return !version ? '' : version.startsWith('sha256:') ? t('本地版本') : /^[a-f0-9]{40}$/i.test(version) ? ui`提交 ${version.slice(0, 7)}` : version;
}
function matchingVersion(manifest: SkillManifest, generation: CanvasProject['generations'][number]) {
  const task = generation.codex?.compiledTask;
  if (!task || task.skill.id !== manifest.installation.id || task.action !== 'generate_image') return false;
  if (manifest.version.bundle) return task.skill.bundle === manifest.version.bundle;
  return task.skill.fingerprint === manifest.source.fingerprint && task.skill.version === manifest.version.installed;
}
export function skillPresentation(manifest: SkillManifest, assets: Record<string, string> = {}, projects: CanvasProject[] = []): SkillPresentation {
  const curated = batchForSource(manifest.source.repository, manifest.version.commit, manifest.source.skillRoot);
  const catalogCopy = visualCatalogEntry(manifest.source.repository, manifest.source.skillRoot);
  const resolve = (reference: string | null) => reference ? assets[reference] || (reference.startsWith('asset:')?reference:'') || (curated && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(reference) ? reference : '') || (manifest.source.type === 'demo' && reference.startsWith('/artwork/') ? reference : '') : '';
  const declared: SkillExampleView[] = manifest.examples.flatMap(example => {
    const image = resolve(example.imageRef);
    return image ? [{ id: example.id, image, label: example.label, exampleSource: manifest.source.type === 'demo' ? 'demo' : manifest.source.type === 'github' ? 'repository' : 'author', verified: false, skillId: manifest.installation.id, skillVersion: manifest.version.installed, sha256: example.sha256, sourceUrl: example.sourceUrl, skillCommit: example.skillCommit, recordedAt: example.recordedAt } as SkillExampleView] : [];
  });
  const successful = projects.flatMap(project => project.generations.map(generation => ({ project, generation })))
    .filter(({ generation }) => generation.status === 'completed' && generation.codex?.stage === 'completed' && generation.codex.result?.status === 'completed' && matchingVersion(manifest, generation))
    .sort((a, b) => b.generation.startedAt - a.generation.startedAt);
  const local: SkillExampleView[] = successful.flatMap(({ project, generation }) => (generation.codex!.result!.outputs || []).flatMap(output => {
    const version = generation.versions.find(version => version.outputId === output.id && version.taskId === generation.id);
    if (!version?.image || version.image.startsWith('asset:')&&version.image!==`asset:result:${generation.id}:${output.id}` || !/^[a-f\d]{64}$/i.test(output.sha256) || !output.width || !output.height) return [];
    const showcase = generation.codex!.compiledTask!.showcase;
    return [{ id: `${generation.id}:${output.id}`, image: version.image, label: showcase?.label || `本机实测 · V${generation.codex!.result!.version || 1}`, exampleSource: showcase ? 'generated_showcase' as const : 'local_verified' as const, verified: true, skillId: manifest.installation.id, skillVersion: generation.codex!.compiledTask!.skill.version, skillCommit: generation.codex!.compiledTask!.skill.commit || undefined, recordedAt: new Date(generation.startedAt).toISOString(), projectId: project.id, taskId: generation.id, outputId: output.id, sha256: output.sha256, width: output.width, height: output.height, purpose: showcase?.purpose, role: showcase?.role, ordinal: showcase?.ordinal, finalPrompt: generation.codex!.result!.finalPrompt }];
  }));
  // Dedicated, version-bound samples outrank unrelated recent user work. Until a
  // replacement succeeds the previous verified sample stays available.
  const dedicated = local.filter(example => example.exampleSource === 'generated_showcase').filter((example, index, all) => all.findIndex(other => other.ordinal === example.ordinal) === index).sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
  const featuredExample = dedicated.find(example => example.role === 'cover') || declared[0] || local.find(example => example.exampleSource === 'local_verified') || dedicated[0];
  // One representative case per Skill. Historical slots remain traceable but
  // cannot reappear in the gallery after a replacement or a project restore.
  const fallback = [...declared, ...local.filter(example => example.exampleSource !== 'generated_showcase')]
    .filter(example => example.id !== featuredExample?.id);
  const examples: SkillExampleView[] = featuredExample ? [featuredExample] : [];
  for (let ordinal = 1; ordinal <= 1; ordinal++) {
    const chosen = dedicated.find(example => example.role === 'case' && example.ordinal === ordinal)
      || fallback.find(example => !examples.some(selected => selected.id === example.id));
    if (chosen && !examples.some(selected => selected.id === chosen.id)) examples.push(chosen);
  }
  const verifiedInputs = new Set<string>();
  for (const { generation } of successful) {
    if (generation.codex!.compiledTask!.request.prompt.trim()) verifiedInputs.add('文本');
    if (generation.codex!.compiledTask!.images.length) verifiedInputs.add('参考图片');
  }
  // A declaration is not a successful input test. Keep it in raw detail/instructions only.
  const inputs = verifiedInputs.size ? [...verifiedInputs] : manifest.source.type === 'demo' ? manifest.inputs.map(input => input.type === '图片' ? '参考图片' : input.type) : [];
  const translation = manifest.installation.translations?.[getLanguage()];
  const name = translation?.name || t(curated?.displayName || catalogCopy?.displayName || displaySkillName(manifest.name || manifest.id));
  const description = curated?.description || catalogCopy?.description || (/[\u3400-\u9fff]/.test(manifest.description) ? manifest.description
    : manifest.name.toLowerCase() === 'imagegen' ? '根据文字或参考图片生成、编辑视觉作品。'
    : name === 'Minimal Zine Poster' ? '创作纸质肌理、大面积留白的极简编辑海报。'
    : '按此 Skill 的创作说明组织输入与生成任务；详细能力见使用说明。');
  // Old source images keep their bytes and provenance; supply readable captions
  // where the original import only provided a generic trial/version label.
  const captions: Record<string, [string, string][]> = {
    'baoyu-xhs-images': [['效率工具推荐', '把工具分类整理成易读的社交知识卡。'], ['设计师的 AI 工作法', '以醒目标题和简洁插画呈现社交图文主题。'], ['4 个可执行的方法', '将行动建议拆解为清晰、有顺序的知识卡片。']],
    'pixel-style-poster-skill': [['Quiet Flight', '以蝴蝶、细点阵与编辑排版呈现印刷海报风格。'], ['Digital Memory', '用植物主体与点阵肌理表达数字记忆主题。'], ['Mint Night Lily', '以植物半调和柔和底色呈现安静的编辑海报。']],
  };
  for (const [index, example] of examples.entries()) {
    const copy = captions[manifest.name]?.[index];
    if (copy && (!example.purpose || /^本机实测(?: · |$)/.test(example.label))) example.label = copy[0];
    if (!example.purpose && copy) example.purpose = copy[1];
    if (!example.label.trim()) example.label = index ? ui`用途案例 ${index}` : ui`${name} · 效果封面`;
    if (!example.purpose) example.purpose = description;
    example.label = skillText(example.label);
    example.purpose = skillText(example.purpose);
  }
  return { rawId: manifest.installation.id, rawName: manifest.name, rawDescription: manifest.description,
    displayName: name, displayDescription: translation?.description || t(description), displayCategory: [primarySkillCategory(manifest, catalogCopy?.category, curated?.category)],
    displayInputCapabilities: [...new Set(inputs.length ? inputs : ['未验证'])],
    displayStatus: !manifest.installation.installed && manifest.installation.rootId === 'catalog-pending' ? '未安装' : manifest.runtime.status === 'ready' ? manifest.installation.executionValidated === false && !successful.length ? '待验证' : '可用' : manifest.runtime.status === 'needs_configuration' ? '需要配置' : '暂不可用',
    versionLabel: versionLabel(manifest), examples, featuredExample };
}

export function projectTitle(project: CanvasProject) {
  const title = project.title.trim();
  const promptTitles = [project.draft.prompt, ...project.generations.map(task => task.draft.prompt)].map(prompt => prompt.trim().slice(0, 40));
  return !title || promptTitles.includes(title) || title.endsWith('· 未命名项目') ? '未命名作品' : title;
}
export function projectRoute(project: CanvasProject) {
  const latest = project.generations[0];
  if (latest?.codex?.action === 'bridge_test') return `/task/${latest.id}`;
  if (project.status === 'completed' && latest?.versions.length) return `/result/${latest.id}`;
  if (['queued', 'running', 'failed', 'cancelled'].includes(project.status) && latest) return `/task/${latest.id}`;
  return '/create';
}
export function projectPresentation(project: CanvasProject) {
  const successful = [...project.generations].filter(task => task.status === 'completed' && task.versions.length).sort((a, b) => b.startedAt - a.startedAt);
  const generation = successful[0];
  const ownVersions = generation?.versions.filter(version => !version.taskId || version.taskId === generation.id) || [];
  const result = ownVersions.at(-1);
  const image = project.customCover?'personal-media:'+project.customCover:result?.image || '';
  const status = ['draft', 'ready'].includes(project.status) ? '草稿' : project.status === 'queued' ? '等待生成' : project.status === 'running' ? '生成中' : project.status === 'failed' ? '生成失败' : project.status === 'cancelled' ? '已取消' : image ? '' : '结果不可用';
  const title=projectTitle(project);
  return { title: title===project.title.trim()?title:t(title), skillName: displaySkillName(project.skillSnapshot?.name || project.skillName), skillVersion: versionLabel(project.skillSnapshot), image,
    resultVersion: result?.label || '', status, route: projectRoute(project), hasResult: !!image,
    time: new Date(project.updatedAt).toLocaleString(getLanguage(), { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) };
}
