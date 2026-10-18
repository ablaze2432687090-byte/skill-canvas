# Skill Canvas user guide

[简体中文](USER_GUIDE.md) · [Project overview](../README.en.md)

## Installation and setup

1. Download a preview `Setup.exe` from [official Releases](https://github.com/ablaze2432687090-byte/skill-canvas/releases). GitHub's source ZIP is not an installer.
2. Optionally compare `Get-FileHash .\Skill-Canvas-0.62.0-Setup.exe -Algorithm SHA256` with the version's `.sha256` file. A checksum is not a publisher signature.
3. The installer is unsigned. Verify its origin before running it; do not disable Windows security protections.
4. Choose the installer language and location. The packaged app does not require a separate Node.js or pnpm installation.
5. Install a compatible Codex CLI and sign in with your own ChatGPT account. Open **Settings → Getting started** to check the program, login and local Bridge. Choose the executable manually if needed.
6. **Generate test image and verify** is an explicit action and consumes account usage. Image capability depends on your account, Codex version and available tools.

## Add and organize Skills

1. Open **Skill Manager → Add Skill** and choose a public GitHub source, ZIP, or local folder.
2. Review the valid `SKILL.md`, source, license, inputs, dependencies and runtime status before installation.
3. Not every imported Skill can run immediately. External services, credentials or software may be required. Unknown setup scripts are not automatically executed for you.
4. Personal names, descriptions, categories, tags, groups and showcase images can be managed without rewriting the original Skill instructions.
5. Optional cover/case generation consumes account usage. Compatible single-image Skills request one cover and one case; mandatory image inputs and grouped-output Skills follow their actual capabilities.

The public distribution includes no author's projects or installed third-party Skill collection. Add your own content.

## Create and revise

1. Choose a Skill in the library, open its details, and select **Use this Skill**.
2. Describe this creation in the prompt. Base Skill instructions are applied separately; you do not need to paste them into the prompt.
3. Add reference images as needed and assign style, subject, composition or edit-target roles. Requirements vary by Skill.
4. Choose the supported aspect ratio and parameters. Preview artwork is not stretched. Requested dimensions are a target, not a guaranteed output pixel size.
5. Select **Generate in Codex** and wait for the real result. Closing the application may interrupt work; this is not a background service.
6. Inspect the result, actual execution prompt, parameters and versions; download the formally saved output file.
7. Continue editing within the existing project to reuse its thread and create another version. Reopen projects from **My Projects** after restarting.

## Manage and personalize

- Projects support grouping, search, multiple selection, duplication and deletion. Read deletion confirmations carefully; reinstalling the app cannot recover deleted files.
- Detail images open in a preview dialog. Ctrl+wheel zooms, dragging pans, and Escape or a click outside closes it.
- Returning to a list restores its browsing position. Floating controls scroll to the top or refresh the current page.
- Settings are always visible, not collapsible. Choose Chinese/English, Light/Dark/Gold/System and text size.
- Skill checks, updates, locks and rollbacks are separate from application updates.

## Backup and data

Create a backup in **Settings → Backup and restore**. Automatic backups require a destination and a saved schedule, and are checked only while the app is running.

Data defaults to `Skill Canvas` under Windows Documents; Settings shows the actual location. Data can be relocated. Projects, reference images, output files, Skills and preferences are separate from the installation directory.

Backups may contain private prompts, images and Skills. Never upload them to a public repository. Restoring on another computer does not transfer Codex login credentials or trusted image-capability verification; sign in and verify again.

## Updating

1. Back up your data; finish or cancel active generation.
2. Close Skill Canvas.
3. Download a higher-version preview installer from official Releases; read its notes and verify its SHA256.
4. Install over the existing application location without deleting the independent data directory.
5. Reopen and check the version, projects, Skills and preferences.

Application updates do not download/install automatically. No stable 1.0 will be published without the author's approval. Open the Releases list directly rather than relying on GitHub's latest-release redirect for previews.

## Troubleshooting

| Symptom | Action |
|---|---|
| Cannot preview a binary attachment | Run the downloaded `.exe` from Windows File Explorer, not the chat preview |
| Codex missing or not signed in | Check/choose the executable in Getting started and sign in inside Codex |
| Skill requires configuration | Inspect runtime issues and upstream requirements; imported does not mean image-validated |
| Generation fails or usage is exhausted | Read the real error and account limits; do not repeatedly resubmit the same work |
| Bridge disconnected | Check or restart the local Bridge from Settings, preserving the original project |
| Missing images | Check data location and disk availability; restore a backup rather than deleting project directories |
| Reporting a problem | Include reproduction steps and redacted diagnostics in Issues; omit raw logs, credentials, prompts and private images |
