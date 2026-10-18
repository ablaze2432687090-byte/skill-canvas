# Skill Canvas

简体中文 · [English](README.en.md)

一个在本机整理视觉 Skill、通过自己的 Codex 账号生成图片的 Windows 桌面工具。

**0.62.0 公开测试版 · Windows x64 · 中英双语 · MIT 开源**

## 下载与安装

到[官方 Releases](https://github.com/ablaze2432687090-byte/skill-canvas/releases)选择最新测试版，下载 `Skill-Canvas-0.62.0-Setup.exe`。GitHub 的 **Source code** ZIP 是源码，不是安装包。

安装包支持中文和英文，安装给当前 Windows 用户。运行桌面版无需另装 Node.js、pnpm 或开发环境。

**当前安装包未签名**，Windows 可能提示未知发布者。先核对来源及同版本 SHA256 校验文件，再决定是否运行；不要关闭系统安全保护。暂不提供 macOS、Linux 安装包。

## 可以做什么

- 从公开 GitHub、ZIP 或本地文件夹添加自己的 Skill，管理分类、分组、名称、简介、标签和展示图。
- 选择 Skill，填写内容与要求，上传参考图并指定风格、主体、构图等角色。
- 通过 Codex 执行生成，自动接收图片，保存项目与版本，并在原线程继续修改。
- 对创作分组、多选、复制、下载和删除，进行数据备份、恢复与迁移。
- 切换中文／英文、常规／夜间／黑金／系统主题和文字大小。

## 第一次使用

1. 准备 Windows x64 电脑。开发验证以 Windows 11 为主，其他环境请先测试。
2. 安装兼容的 Codex CLI，使用自己的 ChatGPT 账号登录。能否生图及可用额度取决于账号、Codex 版本和工具能力。
3. 安装并打开 Skill Canvas，在「设置 → 使用准备」检查环境。
4. 通过「Skill 管理」安装你信任且有权使用的 Skill。
5. Skill 库 → 详情 → 使用此 Skill → 填写输入 → 在 Codex 中生成。

本发行版**不附带作者的项目、私人图片、已安装的第三方 Skill 库或生成案例**。从你自己的 Codex 环境发现的 imagegen 能力，不等于工具预装了第三方 Skill。图片能力测试需主动点击，会使用账号额度。

完整步骤、备份、手动更新和排障见[使用指南](docs/USER_GUIDE.md)。

## 隐私与使用边界

项目和设置保存在本机，独立于安装目录。**生成不是离线处理**：选中的 Prompt 和参考图会交给 Codex 及其图片工具。工具没有 OpenAI 图片 API Key 输入项，也不自动转接独立计费的图片 API。

第三方 Skill 可能包含脚本、外部服务或其他依赖；导入不代表安全背书或保证可运行。请核对原作者来源、许可证和运行要求。

当前应用更新采用**手动下载覆盖安装**，不会自动下载安装。应用更新和 Skill 更新彼此独立。更新前建议备份，不要删除独立数据目录。

## 开发

React + TypeScript + Vite + Electron + 仅监听本机的 Bridge。构建、测试与后续发布步骤见[开发与发布指南](docs/DEVELOPMENT.md)。

## 许可证与反馈

原创代码采用 [MIT 许可证](LICENSE)。依赖保留各自许可证，见[第三方声明](THIRD_PARTY_NOTICES.md)。Codex、ChatGPT 以及自行安装的 Skill 分别适用其自己的条款与许可。本项目独立开发，非 OpenAI 官方应用。

通过 [Issues](https://github.com/ablaze2432687090-byte/skill-canvas/issues)反馈问题时，提供复现步骤与脱敏诊断，勿公开账号凭证、原始日志、私人 Prompt 或图片。
