import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export async function reviewedPython() {
  const executable = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  // Isolated, read-only import probe. No pip, network, user-provided code or install hooks.
  await run(executable, ['-I', '-c', 'import PIL; from PIL import Image; print(PIL.__version__)'], { timeout: 10000, windowsHide: true });
  return executable;
}
