# Development and release / 开发与发布

## Setup

Use Windows x64, Node.js 22.13 or newer and the exact pnpm version specified by `packageManager` in package.json. The app's Electron build uses its bundled runtime. Do not copy another person's data directory into the repository.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Development starts the UI at localhost:5173 and the Bridge at localhost:4717. Production uses its own loopback port and app origin. A compatible Codex CLI signed into your own ChatGPT account is required for real generation, but not ordinary mock/unit tests.

## Tests

```powershell
pnpm build
pnpm test:unit
node scripts/build-desktop.mjs
pnpm test:desktop-unit
pnpm test
```

Browser tests use Microsoft Edge. Close any existing non-test Vite server before running the suite. Real account/usage tests are opt-in and are skipped by default. Never enable paid generation flags in unattended CI. Local historical acceptance scripts and private evidence are not distributed as part of the public source.

## Packaging

```powershell
pnpm desktop:pack
```

The Windows NSIS installer, blockmap, checksum and verification report are generated in `release/`. Build scripts verify the version, bilingual resources, absence of private data/Skill files, and signing status. The public build must remain empty of personal projects and installed third-party Skills.

Application code lives in `src/`, Bridge code in `bridge/`, native integration in `desktop/`. User data is initialized on first launch, separate from source and application files.

## Releasing another preview / 下次发布

1. Update package.json and the lockfile to a new version below 1.0.0. Never replace a published version with different bytes.
2. Update both READMEs and user guides when functionality changes. Add bilingual release notes in `docs/releases/`.
3. Run the tests above, packaging, source privacy audit and installer checks. Test installation on another computer when installation behavior changes.
4. Review the public source allowlist in `scripts/export-public-source.mjs`. Export into a new staging directory. Do not upload the development workspace itself.
5. Commit only the audited source. Create a GitHub Release targeting that exact commit and a matching `v<version>` tag. Mark all versions below 1.0 as **pre-release**.
6. Attach the installer, SHA256 file, release verification report and third-party notices. Do not attach project backups, logs, task directories or credentials. Publish only after all uploads finish.
7. Verify public download links and asset sizes/checksums. Users back up, close the app, download the installer and install over the existing location.

This preview is unsigned and uses manual updates. Automatic updates are intentionally disabled until their existing signature/publisher requirements are satisfied. Do not bypass the signature checks to make a preview auto-update.

## Open-source scope

MIT covers original project code. Dependency licenses remain intact. Codex/ChatGPT are separate products, and installing another author's Skill does not transfer its copyright or license to this project. The public repository contains illustrative test fixtures, not private runtime records.
