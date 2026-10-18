import {readFile,readdir,mkdir,writeFile,copyFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=process.cwd(),rootRequire=createRequire(path.join(root,'package.json'));
const seen=new Set(),packages=[];
async function locate(name,require){
 try{return require.resolve(name+'/package.json');}catch{
  let dir=path.dirname(require.resolve(name));
  for(let i=0;i<12;i++,dir=path.dirname(dir)){try{const file=path.join(dir,'package.json');if(JSON.parse(await readFile(file,'utf8')).name===name)return file;}catch{}}
  throw Error('Cannot locate license metadata: '+name);
 }
}
async function visit(name,require){
 const file=await realpath(await locate(name,require)),meta=JSON.parse(await readFile(file,'utf8')),id=meta.name+'@'+meta.version;
 if(seen.has(id))return;seen.add(id);const dir=path.dirname(file),notices=[];
 for(const entry of await readdir(dir,{withFileTypes:true}))if(entry.isFile()&&/^(?:licen[cs]e|copying|notice)(?:[.\-_]|$)/i.test(entry.name))notices.push({file:entry.name,text:await readFile(path.join(dir,entry.name),'utf8')});
 const license=typeof meta.license==='string'?meta.license:meta.license?.type||'UNKNOWN';
 if(license==='UNKNOWN')throw Error('Missing license declaration: '+id);
 if(!notices.length)notices.push({file:'package.json (upstream supplied no separate license file)',text:JSON.stringify({name:meta.name,version:meta.version,author:meta.author,license,repository:meta.repository},null,2)});
 packages.push({name:meta.name,version:meta.version,license,repository:typeof meta.repository==='string'?meta.repository:meta.repository?.url||null,notices});
 const local=createRequire(file);for(const child of Object.keys(meta.dependencies||{}))await visit(child,local);
 for(const child of Object.keys(meta.optionalDependencies||{})){try{await visit(child,local);}catch(e){if(!String(e.code).includes('MODULE_NOT_FOUND'))throw e;}}
}
const manifest=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
for(const name of Object.keys(manifest.dependencies))await visit(name,rootRequire);
packages.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const out=path.join(root,'desktop','licenses');await mkdir(out,{recursive:true});
await writeFile(path.join(out,'runtime-packages.json'),JSON.stringify({description:'Installed runtime package licenses; no user data or machine paths.',packages},null,2)+'\n');
await copyFile(path.join(root,'LICENSE'),path.join(out,'Skill-Canvas-MIT.txt'));
const electron=path.dirname(await locate('electron',rootRequire));
for(const [name,target]of [['LICENSE','Electron-LICENSE.txt'],['dist/LICENSES.chromium.html','Chromium-NOTICES.html']])await copyFile(path.join(electron,name),path.join(out,target));
const table=packages.map(p=>`| ${p.name} | ${p.version} | ${p.license} |`).join('\n');
await writeFile(path.join(root,'THIRD_PARTY_NOTICES.md'),`# Third-party notices / 第三方声明\n\nOriginal Skill Canvas code is MIT licensed. Dependencies keep their own licenses and copyright notices. Installed third-party Skills are not included and are not relicensed by this project.\n\nFull installed runtime-package notices: [runtime-packages.json](desktop/licenses/runtime-packages.json). Electron: [license](desktop/licenses/Electron-LICENSE.txt); Chromium notices are supplied by Electron and copied to desktop/licenses/Chromium-NOTICES.html during a build. These notices are also included inside the packaged application. When an upstream package supplies only a license declaration, its original package metadata is retained rather than inventing a missing copyright notice. Electron distributions include their upstream license files.\n\n| Runtime package | Version | License |\n|---|---|---|\n${table}\n\nDevelopment dependencies are defined by the lockfile and retain the licenses distributed with their packages. Codex and ChatGPT are separate OpenAI products; no rights to their services, accounts or trademarks are granted by this project's MIT license.\n`);
console.log(JSON.stringify({status:'PASS',runtimePackages:packages.length,licenses:'desktop/licenses'}));
