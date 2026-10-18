import {readFile,readdir,lstat,mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const scripts=['start.mjs','build-desktop.mjs','package-desktop.mjs','audit-release.mjs','verify-packaged-release.mjs','collect-licenses.mjs','export-public-source.mjs'];
const roots=['src','bridge','desktop','public','tests'];
const files=['.gitignore','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','electron-builder.yml','index.html','tsconfig.json','vite.config.ts','playwright.config.ts','README.md','README.en.md','LICENSE','THIRD_PARTY_NOTICES.md','RELEASE_POLICY.md','docs/USER_GUIDE.md','docs/USER_GUIDE.en.md','docs/DEVELOPMENT.md',`docs/releases/v${pkg.version}.md`,...scripts.map(n=>'scripts/'+n)];
const privateTests=new Set(['tests/real-codex.spec.ts','tests/real-recovery.spec.ts','tests/phase4-real.spec.ts','tests/phase5-real.spec.ts']);
async function walk(rel){for(const item of await readdir(path.join(root,rel),{withFileTypes:true})){const name=rel+'/'+item.name,st=await lstat(path.join(root,name));if(st.isSymbolicLink())throw Error('Source links are not allowed: '+name);if(item.isDirectory())await walk(name);else if(!privateTests.has(name)&&name!=='desktop/licenses/Chromium-NOTICES.html')files.push(name);}}
for(const rel of roots)await walk(rel);
const destination=path.resolve(root,'work/public-release',`source-v${pkg.version}-${Date.now()}`),entries=[];
await mkdir(destination,{recursive:true});
for(const rel of files.sort()){
 if(/(^|\/)(?:node_modules|work|output|release|dist|desktop-dist|Skill Canvas Data|\.git|\.skill-canvas)(?:\/|$)/i.test(rel)||/(^|\/)(?:auth\.json|\.env(?:\..*)?|.*\.(?:pfx|p12|pem|log))$/i.test(rel))throw Error('Private filename rejected: '+rel);
 let bytes=await readFile(path.join(root,rel));
 if(/\.(?:tsx?|[cm]?js|json|html|css|md|ya?ml)$/.test(rel)&&/(?:[A-Z]:[\\/]+Users[\\/]+Lenovo|[A-Z]:[\\/]+CUBID|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(bytes.toString()))throw Error('Private machine path or credential pattern rejected: '+rel);
 if(rel==='package.json'){const json=JSON.parse(bytes);delete json.scripts['test:real'];bytes=Buffer.from(JSON.stringify(json,null,2)+'\n');}
 const target=path.join(destination,rel);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});
 const text=/\.(?:tsx?|[cm]?js|json|html|css|md|ya?ml|svg|nsh)$/.test(rel)||rel.endsWith('/LICENSE')||rel==='LICENSE'||rel==='.gitignore';
 entries.push({path:rel,mode:'100644',type:'blob',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),encoding:text?'utf-8':'base64',content:bytes.toString(text?'utf8':'base64')});
}
const manifest={status:'PASS',version:pkg.version,destination,fileCount:entries.length,totalBytes:entries.reduce((n,e)=>n+e.bytes,0),excluded:['personal data','historical private scripts','internal handoff notes','opt-in local evidence tests','credentials','build outputs'],files:entries.map(({content,...e})=>e)};
await mkdir(path.join(root,'work/public-release'),{recursive:true});
await writeFile(path.join(root,'work/public-release/source-audit.json'),JSON.stringify(manifest,null,2));
await writeFile(path.join(root,'work/public-release/source-payload.json'),JSON.stringify(entries));
console.log(JSON.stringify({status:manifest.status,fileCount:entries.length,totalBytes:manifest.totalBytes,destination}));
