# Skill Canvas

[简体中文](README.md) · English

A local Windows workspace for organizing visual Skills and creating images through your own Codex account.

**0.62.0 public preview · Windows x64 · Chinese / English · MIT**

## Download

Open [Releases](https://github.com/ablaze2432687090-byte/skill-canvas/releases), choose the newest preview, and download `Skill-Canvas-0.62.0-Setup.exe`. Do not use GitHub's **Source code** ZIP as an installer.

The installer is **unsigned**. Windows may show an unknown-publisher warning. Verify the repository and SHA256 before deciding whether to run it; do not disable Windows protection. macOS and Linux installers are not available.

## What it does

- Import your own Skills from a public GitHub repository, ZIP, or local folder; organize categories, groups and personal display metadata.
- Use a Skill with a prompt, requirements, and reference images with explicit roles.
- Send work to Codex, collect generated images automatically, and continue editing in the project's original thread.
- Manage local projects, versions, downloads, backup and restore.
- Switch between Chinese/English and Light/Dark/Gold/System appearance.

## Requirements and first launch

1. A Windows x64 computer. Development was tested on Windows 11; other Windows environments may differ.
2. Install a compatible Codex CLI and sign into it with your own ChatGPT account. Image generation availability and limits depend on your account, Codex version and tools.
3. Run the installer. It supports Chinese and English and installs for the current user. You do not need a separate Node.js, pnpm or development environment to run the packaged app.
4. Follow **Getting started** in Settings. Checking the environment does not automatically generate an image. The image capability test is explicit and consumes account usage.
5. Add your own Skill in **Skill Manager**. This distribution contains no author's projects, installed third-party Skill library, generated covers or cases. An imagegen capability discovered in your own Codex installation is not a bundled Skill.

For the complete workflow and troubleshooting, see the [User guide](docs/USER_GUIDE.en.md).

## Privacy and limitations

Projects and settings stay on your computer, separate from the installation. **Generation is not offline**: selected prompts and reference images are sent to Codex and its image tools. There is no OpenAI image API Key field or fallback to a separately billed image API in this app.

Skills can contain instructions, scripts or external dependencies. Importing a Skill is not a security endorsement, and not every online Skill is compatible. Review its source and license. No private projects, credentials or account sessions are bundled.

Application updates are **manual** for this preview: back up, close the app, download a newer installer from Releases and install over the existing location. Skill updates are separate. See [Updating](docs/USER_GUIDE.en.md#updating).

## For developers

See [Development and release](docs/DEVELOPMENT.md) for reproducible setup, tests and packaging. The source uses React, TypeScript, Vite, Electron and a loopback-only local Bridge.

## License

[MIT](LICENSE) applies to original project code. Third-party packages retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md). Codex, ChatGPT and independently installed Skills have their own terms and licenses. This is an independent project, not an official OpenAI application.
