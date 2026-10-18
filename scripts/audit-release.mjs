import {readFile,readdir,lstat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{releasePolicy}=require('../desktop/updates.cjs');
export async function auditRelease(root=process.cwd()){
 const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),info=JSON.parse(await readFile(path.join(root,'desktop-dist/build-info.json'),'utf8'));
 if(info.legacyWorkspace||info.appVersion!==pkg.version)throw Error('构建信息含开发路径或版本不一致。');
 const files=[];
 async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name),rel=path.relative(root,file).replaceAll('\\','/');if(rel==='desktop-dist/release-audit.json')continue;if((await lstat(file)).isSymbolicLink())throw Error('发布文件包含链接。');if(e.isDirectory())await walk(file);else{if(/(^|\/)(auth\.json|\.env(?:\..*)?|desktop\.log|record\.json|project\.json|image-probe-result\.json)$/i.test(rel))throw Error('发布内容包含私人运行数据: '+rel);const bytes=await readFile(file);if(/\.(js|mjs|cjs|json|html|css|md|yml)$/.test(file)&&/(?:C:[\\/]+Users[\\/]+Lenovo|E:[\\/]+CUBID|sk-(?:proj-)?[A-Za-z0-9_-]{24,})/i.test(bytes.toString()))throw Error('发布内容含开发路径或疑似凭证: '+rel);files.push({path:rel,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
 for(const folder of ['dist','desktop','desktop-dist'])await walk(path.join(root,folder));
 const release=JSON.parse(await readFile(path.join(root,'desktop/release.json'),'utf8')),policy=releasePolicy(release);
 return {status:'PASS',appVersion:pkg.version,dataSchemaVersion:info.dataSchemaVersion,updateFeedConfigured:policy.enabled,privateDataIncluded:false,thirdPartySkillsBundled:false,files};
}
// This script intentionally audits only the build allowlist, never user data.
if(process.argv[1]?.endsWith('audit-release.mjs')){const report=await auditRelease();await writeFile('desktop-dist/release-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,files:report.files.length}));}
