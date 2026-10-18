import type { Category, Skill } from '../domain/types';
export const art = (name: string) => `/artwork/${name}.png`;
export const categories: Category[] = ['海报', '照片风格化', '社交媒体', '信息图', '漫画', '演示视觉', '文章封面'];
const paperExamples = ['example-portrait', 'example-dog', 'example-flowers'].map(art);

export const skills: Skill[] = [
  {
    id: 'paper-signal', name: 'Paper Signal', description: '生成高质感海报与视觉设计',
    introduction: '将照片或人物内容转为高级纸张印刷风格海报',
    categories: ['海报', '照片风格化'], input: '图片与文本', formats: ['PNG', 'JPG'],
    cover: art('paper-signal-library'), homeCover: art('paper-signal-cover'),
    before: art('portrait-before'), after: art('paper-signal-after'), examples: paperExamples,
    status: 'installed', version: '1.0.0',
  },
  {
    id: 'minimal-zine', name: 'Minimal Zine Poster', description: '极简拼贴排版，适合杂志风格海报',
    introduction: '生成极简风格的图文排版，保留纸张与印刷质感',
    categories: ['海报', '照片风格化', '文章封面'], input: '图片与文本', formats: ['JPG', 'PNG', 'WEBP'],
    cover: art('minimal-zine-library'), homeCover: art('minimal-zine-cover'),
    before: art('portrait-before'), after: art('result-v4'),
    examples: ['result-v1', 'result-v2', 'result-v3'].map(art), status: 'update', version: '1.0.0',
  },
  {
    id: 'watercolor-portrait', name: 'Watercolor Portrait', description: '将照片转换为柔和的水彩艺术风格',
    introduction: '以柔和色彩和自然笔触重新诠释照片',
    categories: ['照片风格化'], input: '图片', formats: ['PNG', 'JPG'],
    cover: art('watercolor-library'), before: art('recent-sea'), after: art('watercolor-library'),
    examples: [art('watercolor-library'), art('category-photo'), art('recent-flowers')],
    status: 'installed', version: '1.0.0',
  },
  {
    id: 'editorial-poster', name: 'Editorial Poster', description: '快速生成高质量海报与宣传图',
    introduction: '清晰的几何构成，精确的字体层级与编辑设计',
    categories: ['海报', '演示视觉'], input: '文本', formats: ['PNG', 'JPG'],
    cover: art('editorial-library'), homeCover: art('editorial-cover'),
    before: art('category-poster'), after: art('workspace-poster'),
    examples: [art('editorial-library'), art('editorial-cover'), art('workspace-poster')],
    status: 'installed', version: '1.0.0',
  },
  {
    id: 'knowledge-infographic', name: 'Knowledge Infographic', description: '将知识内容整理为清晰的视觉信息图',
    introduction: '用明确的结构组织内容，生成易读的信息图',
    categories: ['信息图', '演示视觉'], input: '文本', formats: ['PNG'],
    cover: art('category-info'), before: art('category-info'), after: art('category-info'),
    examples: [art('category-info')], status: 'installed', version: '1.0.0',
  },
  {
    id: 'social-carousel', name: 'Social Carousel', description: '生成具有统一视觉的社交媒体图文',
    introduction: '将主题内容编排为一组简洁的社交媒体图片',
    categories: ['社交媒体'], input: '图片与文本', formats: ['PNG', 'JPG'],
    cover: art('category-social'), before: art('category-social'), after: art('category-cover'),
    examples: [art('category-social'), art('category-cover')], status: 'installed', version: '1.0.0',
  },
];
export const findSkill = (id: string) => skills.find(skill => skill.id === id);
export const recommendedSkills = ['paper-signal', 'editorial-poster', 'minimal-zine'].map(id => findSkill(id)!);
