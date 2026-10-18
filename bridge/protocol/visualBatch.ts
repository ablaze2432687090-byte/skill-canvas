import type { SkillParameterDefinition } from '../../src/domain/skill';

// Editorial content adapters, pinned to reviewed upstream commits. No executable backend.
const select = (id: string, label: string, options: string[], value = options[0]): SkillParameterDefinition => ({ id, label, type: 'select', options, default: value });
const text = (id: string, label: string): SkillParameterDefinition => ({ id, label, type: 'text', default: '' });
const baoyu = 'https://github.com/JimLiu/baoyu-skills';
const commit = '1567581c26ec29f4216c6e6835415bf30343b0e3';
export const visualBatch = [
  { name: 'baoyu-infographic', displayName: 'Infographic', repository: baoyu, root: 'skills/baoyu-infographic', commit,
    description: '将内容组织为流程、对比或知识信息图，支持布局与视觉风格组合。', category: '信息图',
    parameters: [select('layout', '信息布局', ['linear-progression','binary-comparison','comparison-matrix','hierarchical-layers','tree-branching','hub-spoke','structural-breakdown','bento-grid','iceberg','bridge','funnel','isometric-map','dashboard','periodic-table','comic-strip','story-mountain','jigsaw','venn-diagram','winding-roadmap','circular-flow','dense-modules']), select('style', '视觉风格', ['craft-handmade','claymation','kawaii','storybook-watercolor','chalkboard','cyberpunk-neon','bold-graphic','aged-academia','corporate-memphis','technical-schematic','origami','pixel-art','ui-wireframe','subway-map','ikea-manual','knolling','lego-brick','pop-laboratory','morandi-journal','retro-pop-grid','hand-drawn-edu','retro-popup-pop'], 'ikea-manual'), select('output_ratio','画面比例',['16:9','9:16','1:1','3:4']), select('lang','文字语言',['zh','en','ja'])],
    examples: [{ path: 'screenshots/infographic-styles/craft-handmade.webp', label: '仓库案例 · 手工信息图' }, { path: 'screenshots/infographic-styles/technical-schematic.webp', label: '仓库案例 · 技术结构图' }] },
  { name: 'baoyu-xhs-images', displayName: 'XHS Images', repository: baoyu, root: 'skills/baoyu-xhs-images', commit,
    description: '将内容拆成社交图文卡片，组合视觉风格、信息布局与统一配色。', category: '社交媒体',
    parameters: [select('style','视觉风格',['cute','fresh','warm','bold','minimal','retro','pop','notion','chalkboard','study-notes','screen-print','sketch-notes'],'notion'), select('layout','信息布局',['sparse','balanced','dense','list','comparison','flow','mindmap','quadrant'],'list'), select('palette','配色',['macaron','warm','neon']), select('output_ratio','画面比例',['3:4']), select('output_count','卡片数量',['2','3','4'],'2')],
    examples: [{ path: 'screenshots/xhs-images-styles/notion.webp', label: '仓库案例 · 知识卡片' }] },
  { name: 'baoyu-cover-image', displayName: 'Cover Image', repository: baoyu, root: 'skills/baoyu-cover-image', commit,
    description: '根据文章主题生成封面，独立选择构思、配色、绘制方式与标题。', category: '文章封面',
    parameters: [select('type','封面构思',['hero','conceptual','typography','metaphor','scene','minimal'],'minimal'), select('palette','配色',['warm','elegant','cool','dark','earth','vivid','pastel','mono','retro','duotone','macaron'],'elegant'), select('rendering','绘制方式',['flat-vector','hand-drawn','painterly','digital','pixel','chalk','screen-print'],'flat-vector'), select('text','文字内容',['none','title-only','title-subtitle','text-rich'],'title-only'), select('mood','表现力度',['subtle','balanced','bold'],'subtle'), select('font','字体气质',['clean','handwritten','serif','display']), select('output_ratio','画面比例',['16:9','2.35:1','4:3','3:2','1:1','3:4']), select('lang','文字语言',['zh','en','ja'])],
    examples: [{ path: 'screenshots/cover-image-styles/minimal.webp', label: '仓库案例 · 极简文章封面' }, { path: 'screenshots/cover-image-styles/blueprint.webp', label: '仓库案例 · 蓝图式封面' }] },
  { name: 'pixel-style-poster-skill', displayName: 'Pixel Style Poster', repository: 'https://github.com/v92388375-gif/pixel-style-poster-skill', root: '', commit: 'b93066b52fc2f32bf9ec3a9a6d379b4088d6fd7b',
    description: '以细点阵、半调与低分辨率印刷肌理构成实验性编辑海报。', category: '海报',
    parameters: [select('output_ratio','画面比例',['3:4']), select('layout','构图',['quiet-specimen','title-subject-lockup','oversized-crop','diary-grid','soft-wash-reverse-halftone','text-as-image'],'title-subject-lockup'), select('bitmap_method','点阵方式',['fine dot-matrix halftone','square-pixel silhouette','dense-to-sparse pixel fade']), text('ink_color','油墨颜色')],
    examples: [{ path: 'examples/deep-teal-butterfly.png', label: '仓库案例 · 蝴蝶点阵海报' }, { path: 'examples/mint-night-lily.png', label: '仓库案例 · 植物半调海报' }] },
  { name: 'poster-generator', displayName: 'Poster Generator', repository: 'https://github.com/howardz27/poster-generator-skill', root: '', commit: 'fa2a40bf0943c14dbcf2dfd86a2efe66fa8b4cbc',
    description: '提取海报文字层级并自动组织构图，支持多种活动与编辑视觉风格。', category: '海报',
    parameters: [select('style','设计风格',['swiss-editorial','neo-brutalist','luxury-minimal','constructivist-impact','bauhaus-modular','pop-commercial','cinematic-key-art','data-editorial','organic-craft','futurist-gradient','editorial-collage','japanese-ma','monochrome-typographic','art-deco-luxe','risograph-zine','glassmorphism-ui','surreal-3d-editorial','retro-futurism','botanical-premium','hyperreal-product']), select('output_ratio','画面比例',['2:3','4:5','9:16','1:1','3:4','16:9']), select('lang','文字语言',['en','zh','ja'])],
    examples: [{ path: 'examples/en/bauhaus-modular/poster-gpt-image-2.jpg', label: '仓库案例 · 包豪斯海报' }, { path: 'examples/en/neo-brutalist/poster-gpt-image-2.jpg', label: '仓库案例 · 新粗野主义海报' }] },
  { name: 'dreamcore-collage-poster', displayName: 'Dreamcore Collage Poster', repository: 'https://github.com/AndrwewHan/dreamcore-collage-poster', root: '', commit: '509a2d8392f995a45716d57bdcb60a57c2973dca',
    description: '将主题或照片重组为梦核拼贴，以重复碎片、异常尺度和屏幕退化构图。', category: '海报',
    parameters: [select('output_ratio','画面比例',['3:5']), select('construction','拼贴结构',['fractured-mosaic','giant-anchor-echoes','altar-grid','interface-collage','dark-void-montage','translucent-block-field','oversized-crop'],'interface-collage'), select('texture','退化质感',['CRT scanlines and RGB chromatic aberration','halftone dots and photocopy dirt','JPEG blocks and early-web compression','paper grain and imperfect registration']), text('palette','主色组合')], examples: [] },
];
export function batchForSource(repository: string | null, commit: string | null, root?: string) { return visualBatch.find(item => item.repository === repository && item.commit === commit && (root === undefined || item.root === root)); }
