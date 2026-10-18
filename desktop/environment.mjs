import path from 'node:path';
import os from 'node:os';
import {readdir,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';

// Resolve npm/pnpm shims to the native binary. Never run a .cmd through a shell:
// quoting a user-selected path in cmd.exe is both fragile and unnecessary.
export async function resolveCodexExecutable(file,{exists,arch=process.arch}={}) {
  if(!/\.(cmd|ps1)$/i.test(file))return file;
  if(!/^codex\.(cmd|ps1)$/i.test(path.basename(file)))throw Error('请选择 Codex 程序。');
  const prefix=path.dirname(path.resolve(file)),triple=arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
  const packageName=`@openai/codex-win32-${arch==='arm64'?'arm64':'x64'}`;
  const main=path.join(prefix,'node_modules/@openai/codex');
  const roots=[main,path.join(prefix,'node_modules',packageName),path.join(main,'node_modules',packageName)];
  try{roots.unshift(path.dirname(createRequire(path.join(main,'package.json')).resolve(packageName+'/package.json')));}catch{}
  for(const root of roots)for(const relative of [`vendor/${triple}/codex/codex.exe`,`vendor/${triple}/codex.exe`]){
    const candidate=path.join(root,relative);if(await exists(candidate))return candidate;
  }
  throw Error('找到了 Codex 启动脚本，但没有找到配套的 Windows 原生程序。请修复 Codex 安装，或选择实际的 codex.exe。');
}
export async function discoverCodex({env=process.env,explicit,execute,exists}) {
  if(explicit)return resolveCodexExecutable(explicit,{exists});
  if(env.SKILL_CANVAS_CODEX)return resolveCodexExecutable(env.SKILL_CANVAS_CODEX,{exists});
  for(const name of ['codex.exe','codex.cmd','codex.ps1'])try{const r=await execute('where.exe',[name],{windowsHide:true,timeout:5000});for(const file of r.stdout.trim().split(/\r?\n/))if(await exists(file)){try{return await resolveCodexExecutable(file,{exists});}catch{}}}catch{}
  const parent=path.join(env.LOCALAPPDATA||path.join(os.homedir(),'AppData/Local'),'OpenAI/Codex/bin');
  const found=[];for(const entry of await readdir(parent).catch(()=>[])){const file=path.join(parent,entry,'codex.exe');if(await exists(file))found.push({file,mtime:(await stat(file)).mtimeMs});}
  return found.sort((a,b)=>b.mtime-a.mtime)[0]?.file||'codex';
}
