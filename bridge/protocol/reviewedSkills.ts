// Reviews apply to these exact immutable bundles, never to an author or name alone.
export const reviewedSkills = [
  { name: 'marketing-design', repository: 'https://github.com/vanducng/skills', bundle: '213ad07f4d066b3e7bd965614f74ba7b51a7c9496db27fa72ce38b77971e6393', python: false,
    instruction: '仅适配原 Skill 的 Logo、CIP 栅格品牌应用与海报 Prompt 模块。直接读取所选 references 和数据，采用内置 image_gen，不执行 search.py、generate.py 或其它附带脚本，不启动嵌套 Codex CLI，不启用 Gemini 自动回退或任何 API。参考标志须作为真实图像输入。此适配不提供 SVG 图标、HTML 截图、印刷交付或完整品牌手册；这些需求应明确返回未支持。' },
  { name: 'mono-color', repository: 'https://github.com/yanliudesign/mono-color-skill', bundle: '55ac94c3dce1f6b95f19604a40963a36bdbfc838804244abfa51e8dec0a326ce', python: false,
    instruction: '采用原 Skill 的设计系统和 Prompt Compiler，由 Codex 内置 image_gen 生成最终图片。scripts 中的设计板、固定样稿及开发校验不是生图依赖，不执行这些辅助脚本；不要写入原 Skill 要求的 Desktop/Claude skills 目录。' },
  { name: 'qiaomu-mondo-poster-design', repository: 'https://github.com/joeseesun/qiaomu-mondo-poster-design', bundle: 'c87a8fef630d8b2a099477088538a9e41ab5f04ea785fd74bc0be3e9f4bb7d07', python: false,
    instruction: '采用原 Skill 明确允许的 Manual Generation 路径：完整读取构图和风格资料，在 Codex 中编译海报 Prompt，交给内置 image_gen。禁止运行 generate_mondo.py、generate_mondo_enhanced.py，禁止 AI Gateway、PipeLLM 和任何外部 API。无需 requests 或 API Key；保留有限色丝网印刷、符号叙事与负空间方法。' },
  { name: 'xxg-portrait-rebuild-light', repository: 'https://github.com/moskoo/xxg-portrait-rebuild-light', bundle: 'f54665bfc1829415b16300ba5d928b9040d814cd39168996f9b65f12edcd3e4c', python: true,
    instruction: '原生图像编辑；必须使用实际上传的人像。仅允许 scripts/check_aspect_ratio.py 对输入和生成结果做只读比例审查，不得运行其它脚本，不得在本地修改图片。缺少人像输入时返回 failed。' },
] as const;
export function reviewedProfile(skill: { name: string; source: { repository: string | null }; version: { bundle?: string } }) {
  return reviewedSkills.find(review => review.name === skill.name && review.repository === skill.source.repository && review.bundle === skill.version.bundle);
}
