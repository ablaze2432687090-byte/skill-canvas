import type { SkillManifest } from '../domain/skill.ts';
import type { CanvasProject, Draft } from '../domain/types.ts';
import { applySkillParameters } from './skillViews.ts';
import { parameterOptions } from '../domain/manifest.ts';
import { showcaseBriefs } from './showcaseBriefs.ts';

export const showcaseCanvas = { schema: 1, aspect_ratio: '3:4', size: '1536 × 2048' } as const;

export interface ShowcaseBrief { label: string; purpose: string; prompt: string; parameters?: Draft['parameters'] }
type Brief = ShowcaseBrief;
export function supportsSingleShowcase(skill: SkillManifest) {
  const count = skill.parameters.find(parameter => parameter.id === 'output_count');
  return !count || count.type === 'select' && count.options.includes('1') || (count.type === 'number' || count.type === 'range') && count.min <= 1 && count.max >= 1;
}
// Optional editorial recipes, not special cases in the compiler, renderer, or data model.
const recipes: Record<string, Brief[]> = {
  imagegen: [
    { label: '通用图像创作', purpose: '展示摄影、插画和立体视觉三种方向；imagegen 本身不限制为一种风格。', prompt: '生成一张竖向 3:4 的高质量图像能力封面。图像本身是三个上下排列、等高、无间隙的创意画面，禁止画软件界面、卡片、文字或标志。上三分之一：米白陶瓷咖啡杯与浓缩咖啡，细腻自然的商业产品摄影，温暖沙色背景。中三分之一：靛蓝与杏色平面纸感插画，一只鸟和植物，清楚的剪纸层次。下三分之一：半透明琥珀玻璃球与柔白几何形体，精致立体材质渲染。三种媒介明显不同、主体足够大、配色协调；成品体现可用的摄影、插画、概念视觉而不是抽象 AI 光效。' },
    { label: '产品摄影', purpose: '输入产品和场景描述，生成可用于商品展示的产品图。', prompt: 'Use case: product-mockup. 生成竖向 3:4 的陶瓷咖啡杯产品摄影：一只奶油白色带把手的陶瓷杯，杯口可见浓缩咖啡与细腻油脂，放在浅沙色石材台面，侧后方柔和窗光，真实陶瓷釉质和石材纹理，克制阴影。主体占画面约一半，清晰完整，不裁杯把。背景安静、没有额外杯子、没有品牌、文字、水印。真实可用的摄影成品，不是软件界面。' },
    { label: '叙事插画', purpose: '输入故事、主题和画风，生成封面或配图。', prompt: 'Use case: illustration-story. 生成竖向 3:4 的原创编辑插画：深靛蓝夜晚，一只温暖杏橙色的鸟停在大叶植物上，抬头望着一颗小小月亮。纸张肌理、平面剪纸层次、优美大形、柔和不规则边缘，主题是安静的夜间花园。鸟与植物是清楚的大视觉主体，丰富但有秩序，限制配色为靛蓝、杏橙、米白。不是照片，不要 3D、文字、水印或 UI。' },
  ],
  'gc-minimal-zine-poster-v0-3': [
    { label: '纸感极简海报', purpose: '将一个主题变为纸张肌理、实验排版和单色视觉锚点的编辑海报。', prompt: '用此 Skill 生成一张 3:4 竖向成品海报，作为它的真实效果封面。主题是“城市中的一瞬”。暖白旧纸满幅、可见纤维与扫描颗粒，约 75% 留白；一块占画面约 22% 的黑白城市建筑剪影纸片在右上偏中，与短词 "PAUSE" 形成克制的粗糙活字排版关系。一个高饱和群青蓝实心印刷色窗嵌在建筑片段中，总画面约 2.5% 色彩面积，缩略图仍能看清。配方 upper-right-block / rectangular photo clipping / edge-pressed phrase / ultramarine / risograph grain。短词清楚但不是商业大标题。必须有实际可辨认的建筑片段和排版事件，不能只生成空白纸。不加边框、实物样机、广告或第二主色。读取 Skill 并按其四段 Prompt 编译与质量门检查。' },
    { label: '文字主题 → 诗性海报', purpose: '将一句短句转为一个视觉隐喻，适合诗集、文章配图与个人 zine。', prompt: '用此 Skill 生成 3:4 竖向诗性编辑海报，主题“风吹过的痕迹”，只使用短词 "WIND"。淡象牙色纸，75%-80% 开放纸面；左下偏中是一张占画面约 20% 的灰黑植物叶片印刷剪贴，两片叶形成风的方向；一片叶的局部鲜明番茄红色墨层约占画面 2%，字母 WIND 沿叶片旁微斜散开。配方 lower-left-float / torn botanical clipping / diagonal scattered letters / tomato red / halftone + ink bleed / no extra marks。视觉锚点须明确、足够在缩略图辨认，不能纸上只有极小的点。保持平面扫描纸感和克制排版；不做全幅场景或商品广告。按 Skill 编译最终四段 Prompt 并查看实际结果。' },
    { label: '内容概念 → 编辑海报', purpose: '将文章或抽象概念提炼为关系隐喻，保持同一风格但改变构图。', prompt: '用此 Skill 生成 3:4 竖向概念编辑海报，主题“距离让关系显现”，只使用短词 "BETWEEN"。浅灰米色纤维纸，约 76% 留白；中上区域两个略有错位的黑白海面印刷片段构成 dual-panel，整体约占画面 23%，中间窄缝里有一小块饱和柠檬黄纸片，总色彩面积约 2%。短词 BETWEEN 用小号老衬线排版压在右侧片段下沿，一条极细的短注释线即可。配方 dual-panel / two grayscale photo windows / edge-pressed phrase / lemon yellow clipping / xerox softness / quiet archival。海面片段、间隙和黄纸片必须能辨认；不要只有空纸，不要重复其他案例构图，不要渐变、花卉、全幅摄影或商业标题。遵循 Skill 的四段 Prompt 和质量门。' },
  ],
};

export function createShowcaseProjects(skill: SkillManifest, options: { briefs?: ShowcaseBrief[]; singleCardApproved?: boolean } = {}): CanvasProject[] {
  if (!skill.installation.installed || skill.runtime.status !== 'ready' || skill.source.type === 'demo') throw new Error('此 Skill 尚不能真实生成案例。');
  if (!supportsSingleShowcase(skill) && !options.singleCardApproved) throw new Error('此 Skill 的当前参数要求成组出图，请在工作台生成；成功结果会自动关联到详情案例。');
  if (skill.inputs.some(input => input.required && input.type === '图片')) throw new Error('此 Skill 必须提供实际输入图片，暂不能无图自动生成案例。请先用真实参考图完成一次创作。');
  const name = skill.name, setId = crypto.randomUUID(), now = new Date().toISOString();
  const briefs = options.briefs || (showcaseBriefs[name]?.[0].label !== '保留封面' ? showcaseBriefs[name] : undefined) || [...(recipes[name] || [
    { label: '风格封面', purpose: '根据此 Skill 的真实说明制作一张代表性成品。', prompt: '完整读取指定 Skill 的说明与必需参考，选择它真实支持的最有代表性用途，生成一个完成度高、视觉主体可辨认的成品作为封面。它必须体现 Skill 的特有风格或用途，不要画软件 UI，不要空白纹理或无意义的抽象 AI 图。没有输入图片，不得声称做了编辑或参考图保真。' },
    { label: '应用案例 A', purpose: '根据说明自动选择一个典型用途，具体执行 Prompt 可展开查看。', prompt: '完整读取指定 Skill 与必需参考，选择它真实支持的一个具体日常创作用途，生成可实际使用的成品。主题与构图应独立于封面，明显体现其真实用途与风格。先在 finalPrompt 中明确该用途，再记录实际传给 image_gen 的 Prompt。没有输入图片，不得冒充 Before/After 或输入保真测试。' },
    { label: '应用案例 B', purpose: '展示另一个主题或构图，不代表已测试此 Skill 的全部能力。', prompt: '完整读取指定 Skill 与必需参考，选择另一个典型创作主题和构图，生成有代表性、完成度高的成品。保持该 Skill 自身风格，但不要简单重复案例 A。实际用途和图像 Prompt 必须完整记录到 finalPrompt。没有输入图片，不得伪造参考图片、Before/After 或能力验证。' },
  ]), { label: '专题视觉创作', purpose: '用新的主题展示此 Skill 的实际应用，具体需求与执行指令可追溯。', prompt: '读取指定 Skill，生成一张原生 3:4 竖向成品，用新的具体主题展示其真实视觉特征。与已有封面、案例不同，主题、主体、用途清楚，不画 UI，不生成空白纹理，不伪造参考图测试。准确记录实际出图 Prompt。' }];
  if (![2, 4].includes(briefs.length) || briefs.some(brief => !brief.label.trim() || !brief.purpose.trim() || !brief.prompt.trim())) throw new Error('展示方案须包含封面和有名称、用途及提示词的案例。');
  // Explicit historical four-slot recipes are still readable by maintenance
  // tooling. Normal app operations now submit only a cover and one case.
  return (options.briefs ? briefs : briefs.slice(0, 2)).map((brief, ordinal) => {
    const parameters: Draft['parameters'] = { ...brief.parameters, output_count: '1', output_format: 'PNG' };
    const ratioParameter = skill.parameters.find(parameter => parameter.id === 'output_ratio');
    const native = !ratioParameter || ratioParameter.type === 'text' || ratioParameter.type === 'select' && parameterOptions(ratioParameter, parameters).includes(showcaseCanvas.aspect_ratio);
    if (ratioParameter && native) parameters.output_ratio = showcaseCanvas.aspect_ratio;
    const countParameter = skill.parameters.find(parameter => parameter.id === 'output_count');
    if (countParameter?.type === 'number' || countParameter?.type === 'range') parameters.output_count = 1;
    const draft = applySkillParameters({ skillId: skill.installation.id, prompt: brief.prompt, requirements: '制作本机生成示例。读取指定 Skill 后使用内置 image_gen；每个任务只生成 1 张真正 PNG 成品。封面与案例均原生构图为竖向 3:4，完整保留主体与文字，不拉伸、不裁切关键内容、不靠填边适配。检查成品的主体、风格与用途，记录实际执行 Prompt。', references: [], parameters, ratio: showcaseCanvas.aspect_ratio, size: showcaseCanvas.size, count: 1, format: 'PNG' }, skill);
    const source_parameters = Object.fromEntries(Object.entries(draft.parameters || {}).filter(([key]) => ['output_ratio', 'output_size', 'output_count'].includes(key)));
    return { id: crypto.randomUUID(), title: brief.label, createdAt: now, updatedAt: now, skillName: name, skillSnapshot: structuredClone(skill), draft: { ...draft, ratio: showcaseCanvas.aspect_ratio, size: showcaseCanvas.size, count: 1, format: 'PNG' }, status: 'draft', generations: [], thumbnail: null, showcase: { schema: 1, setId, role: ordinal === 0 ? 'cover' : 'case', ordinal, label: brief.label, purpose: brief.purpose, canvas: { ...showcaseCanvas, composition: native ? 'native' : 'recompose', source_parameters } } };
  });
}

export function latestShowcaseProjects(skill: SkillManifest, projects: CanvasProject[]) {
  const matching = projects.filter(project => project.showcase && project.skillSnapshot?.installation.id === skill.installation.id && project.skillSnapshot.source.fingerprint === skill.source.fingerprint && project.skillSnapshot.version.installed === skill.version.installed && project.skillSnapshot.version.bundle === skill.version.bundle);
  const latest = [...matching].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.showcase?.setId;
  return matching.filter(project => project.showcase!.setId === latest).sort((a, b) => a.showcase!.ordinal - b.showcase!.ordinal);
}
