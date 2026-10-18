import { build } from 'esbuild';
import { copyFile, writeFile, readFile } from 'node:fs/promises';
const pkg=JSON.parse(await readFile('package.json','utf8'));
await build({ entryPoints: ['desktop/bridge-entry.mjs'], outfile: 'desktop-dist/bridge.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node24', banner: { js: "import { createRequire as desktopCreateRequire } from 'node:module'; const require = desktopCreateRequire(import.meta.url);" } });
// Never ship a path into the developer's private workspace.
await writeFile('desktop-dist/build-info.json', JSON.stringify({ appVersion: pkg.version, dataSchemaVersion: 1 }));
// User-selected C: 66% height, centered, with native 16–256 px icon frames.
// Keep the application/sidebar Logo and catalog assets unchanged.
await copyFile('desktop/assets/icon-c.ico', 'desktop-dist/icon.ico');
await copyFile('LICENSE', 'desktop-dist/LICENSE.txt');
await copyFile('THIRD_PARTY_NOTICES.md', 'desktop-dist/THIRD_PARTY_NOTICES.md');
