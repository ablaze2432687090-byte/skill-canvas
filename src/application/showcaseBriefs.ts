import type { ShowcaseBrief } from './showcase.ts';
const brief = (label: string, purpose: string, prompt: string, parameters?: ShowcaseBrief['parameters']): ShowcaseBrief => ({ label, purpose, prompt: `读取指定 Skill 与必需参考，使用其真实风格。原生 3:4 竖幅 PNG，满画布构图，无黑边、外框、展示样机、水印或软件 UI。${prompt}`, parameters });

// Editorial briefs only: execution stays in the generic manifest/compiler pipeline.
export const showcaseBriefs: Record<string, ShowcaseBrief[]> = {
  'baoyu-infographic': [
    brief('从想法到成品', '将工作步骤转为一眼可读的流程信息图。', '标题“从想法到成品”。四步由上到下：明确需求、整理参考、生成初稿、判断精修。四个大而清楚的线稿图标：靶心、文件夹、画笔、检查勾。米白纸、黑色精确线条、少量钴蓝强调；步骤编号 01—04，清楚箭头。仅这些文字，无额外说明。像高质量说明书，缩略图能看清流程。', { layout: 'linear-progression', style: 'ikea-manual', lang: 'zh' }),
    brief('咖啡风味地图', '把概念和分类组织成有层次的知识图。', '标题“咖啡风味地图”。中心咖啡杯向外连接四类：花香、果香、坚果、可可；对应花、柑橘、榛子、可可豆的小插画。奶油纸感、手作细节、棕与珊瑚橙；信息结构明确，手工信息图而非装饰海报。仅上述文字，不加数据。', { layout: 'hub-spoke', style: 'craft-handmade', lang: 'zh' }),
    brief('灵感与执行', '将两种工作方式转成清晰的对比信息图。', '标题“灵感与执行”。上下两组，每组含三点。灵感：发散、联想、探索；执行：筛选、排序、完成。用手绘灯泡和工具作为两组大图标，严格对齐的比较布局；米白底、黑细线、柔和蓝黄小色块，疏朗文字，不能生成密集仪表盘。', { layout: 'binary-comparison', style: 'hand-drawn-edu', lang: 'zh' }),
    brief('一棵树的结构', '将对象拆解为带标注的结构科普图。', '标题“一棵树的结构”。一棵完整树木的科学结构示意，从树冠到地下根系，各用细引线清楚标注：叶、枝、树干、根。米白底、绿棕克制配色、严谨线条、每个中文标签仅一次，不加虚构数值。内容面向普通读者，不拟人，不做照片。', { layout: 'structural-breakdown', style: 'technical-schematic', lang: 'zh' }),
  ],
  'baoyu-cover-image': [
    brief('少即是多', '将文章主题提炼为单一视觉隐喻和清晰标题。', '做真正文章封面，标题仅“少即是多”。暖白纸面，一张折叠米白纸形成简洁雕塑与漂亮阴影，一颗小朱红圆点构成视觉锚点；醒目的干净黑色中文标题、均衡留白。图像与标题形成编辑关系，不能只有几个小点或空纸。', { type: 'minimal', palette: 'elegant', rendering: 'flat-vector', text: 'title-only', lang: 'zh' }),
    brief('把时间留给创意', '为创作方法类文章生成带概念隐喻的封面。', '标题“把时间留给创意”。奶油白底，一只抽象沙漏，上端细沙在下端变成盛开的蓝色纸花；概念直观，主体清楚，深蓝中文标题，极简平面手绘编辑插图，仅标题不加副标题。', { type: 'metaphor', palette: 'elegant', rendering: 'hand-drawn', text: 'title-only', lang: 'zh' }),
    brief('城市的慢时刻', '为生活方式文章生成氛围叙事封面。', '标题“城市的慢时刻”。安静城市街角，一扇高窗与窗下木椅、咖啡杯、柔和午后斜光，暖沙色与砖红配色，painterly编辑绘画，不是照片；大标题清晰且避开主体。只给定标题，无其他文案。', { type: 'scene', palette: 'warm', rendering: 'painterly', text: 'title-only', lang: 'zh' }),
    brief('设计新的秩序', '为设计观点文章生成强调排版与概念的封面。', '标题“设计新的秩序”。大号严谨中文排版与三个错位但有秩序的蓝色几何块，暖白纸底；强网格，显著的字与图关系，编辑概念封面，只给定标题，不出现 UI、表格或控制台。', { type: 'typography', palette: 'duotone', rendering: 'flat-vector', text: 'title-only', mood: 'balanced', lang: 'zh' }),
  ],
  'poster-generator': [
    brief('设计的未来', '将主题与文字层级转成专业活动主视觉。', '设计展主视觉，文字仅“FUTURE OF DESIGN”和“AI × HUMAN CREATIVITY”。瑞士编辑网格，大号黑色无衬线标题，一枚巨大钴蓝圆与黑白半调建筑裁片组合，象牙白底，严谨层级，成品从缩略图就能看出海报排版能力。无日期地址CTA。', { style: 'swiss-editorial', lang: 'en' }),
    brief('包豪斯工作坊', '用模块化几何组织活动海报的信息层级。', '文字仅“FORM LAB”和“SHAPE / COLOR / SPACE”。包豪斯模块化构图，圆、半圆、方形，暖白底，红黄蓝黑原色，模块间精确留白，强烈设计海报感，不画普通几何壁纸。', { style: 'bauhaus-modular', lang: 'en' }),
    brief('植物研究展', '为自然与生活方式主题制作精致展览海报。', '文字仅“BOTANICAL STUDIES”和“FORM IN NATURE”。一株完整银绿色蕨叶精致植物印刷插画，象牙白底，深绿优雅衬线标题，细节丰富而克制；图文层级完整，高端植物展视觉，无假日期地点。', { style: 'botanical-premium', lang: 'en' }),
    brief('独立音乐现场', '以强对比文字构图呈现音乐与文化活动。', '文字仅“AFTER HOURS”和“LIVE SOUND”。新粗野主义海报，粗黑超大文字、荧光黄大色块、复印纹理的抽象扬声器波形剪贴，黑白黄三色，有意冲撞但可读；不是赛博 UI，不加虚假艺人或票价。', { style: 'neo-brutalist', lang: 'en' }),
  ],
  'dreamcore-collage-poster': [
    brief('梦核数字记忆', '把主题重组为高密度、屏幕退化质感的超现实拼贴。', '主题文字仅“DREAMCORE”。巨大的旧 CRT 显示器是锚点，漂浮眼睛、透明视窗、重复方块、扫描线和 RGB 色差，青紫酸黄深黑，怪诞数字记忆，密集但焦点清楚。不要普通产品照片，不复制软件界面；遵循 Skill 拼贴结构，只将构图重排为用户要求的 3:4。', { construction: 'interface-collage' }),
    brief('不存在的走廊', '以建筑碎片与异常尺度表达错位记忆。', '仅文字“LOST ROOM”。不可能的旧校园走廊，重复门框、悬浮楼梯、巨大日光灯、透明矩形块，冷青与淡粉、深黑，fractured-mosaic 碎裂拼贴，CRT 扫描线和早期网络压缩，焦点清晰，不画普通建筑摄影。', { construction: 'fractured-mosaic' }),
    brief('海中的房间', '将熟悉物件与不可能环境组合成梦核叙事。', '仅文字“BLUE MEMORY”。旧卧室的门悬浮于海面，巨大的珍珠与重复窗户、贝壳和低分辨率片段，透明蓝方块重叠，深海蓝、苍白青、酸黄小面积；giant-anchor-echoes构图、半调复印噪点与错位印刷，密集梦核 collage，不是写实风景。', { construction: 'giant-anchor-echoes', texture: 'halftone dots and photocopy dirt' }),
    brief('午夜记忆档案', '用重复碎片和档案式排列构成实验音乐视觉。', '仅文字“NIGHT ARCHIVE”。巨大旧磁带、眼睛、重复手指剪影、黑色星体、半透明文件块，紫黑酸绿，祭坛式上下层叠，低保真 JPEG 块、扫描线、异常尺度，仪式档案感，必须看得出真实拼贴碎片，不做普通复古游戏画。', { construction: 'altar-grid', texture: 'JPEG blocks and early-web compression' }),
  ],
  'baoyu-xhs-images': [
    brief('保留封面', '保留现有图片', '此槽位不生成'),
    brief('保留案例一', '保留现有图片', '此槽位不生成'),
    brief('保留案例二', '保留现有图片', '此槽位不生成'),
    brief('视觉参考整理法', '将实用方法整理为可直接发布的社交知识卡。', '用户本次只要补充一张独立知识卡，不要成组，不额外生成封面。标题“整理参考的 4 个步骤”。四条：明确主题、收集素材、标记亮点、分类归档。四个大而清楚的手绘图标：靶心、图片堆、荧光笔、文件夹；Notion 风格，暖白纸、黑色手绘线，柔和蓝黄粉小色块，四条均衡纵向排列。仅给定文字，无水印，无页码。', { style: 'notion', layout: 'list', palette: 'macaron' }),
  ],
  'pixel-style-poster-skill': [
    brief('保留封面', '保留现有图片', '此槽位不生成'),
    brief('保留案例一', '保留现有图片', '此槽位不生成'),
    brief('保留案例二', '保留现有图片', '此槽位不生成'),
    brief('潮汐标本', '将自然物件转译成细点阵与实验排版的编辑海报。', '主题“TIDAL FORM”。一枚巨大而优雅的螺旋贝壳，深墨蓝极细点阵半调，密度由实到虚、精致印刷颗粒，淡蓝灰纸面。大号斜体衬线标题与贝壳互锁，安静微型注释仅“PRINT STUDY 03”，不是游戏像素画，不用方块像素角色。主体占画面 60%，边缘完整，留白克制。', { layout: 'title-subject-lockup', bitmap_method: 'fine dot-matrix halftone', ink_color: 'deep ink blue' }),
  ],
};
