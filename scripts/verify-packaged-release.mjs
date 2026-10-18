import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const require=createRequire(import.meta.url),builder=createRequire(require.resolve('electron-builder')),lib=createRequire(builder.resolve('app-builder-lib/package.json'));
const {listPackage,extractFile}=lib('@electron/asar');
const pkg=JSON.parse(await readFile('package.json','utf8')),archive=path.resolve('release/win-unpacked/resources/app.asar');
const files=listPackage(archive).map(file=>file.replaceAll('\\','/').replace(/^\//,''));
for(const file of files){
 if(!['dist','desktop','desktop-dist','node_modules','package.json'].includes(file.split('/')[0]))throw Error('安装包出现非允许目录：'+file);
 if(/(^|\/)(auth\.json|\.env(?:\..*)?|desktop\.log|record\.json|project\.json|image-probe-result\.json|SKILL\.md)$/i.test(file))throw Error('安装包含运行数据或预装 Skill：'+file);
}
const bundled=JSON.parse(extractFile(archive,'package.json').toString());if(bundled.version!==pkg.version)throw Error('安装包版本不一致。');
const locale=JSON.parse(extractFile(archive,path.join('desktop','locales','en.json')).toString());
const skillLocale=JSON.parse(extractFile(archive,path.join('desktop','locales','skill-en.json')).toString());
if(skillLocale['画面比例']!=='Aspect ratio'||!skillLocale['从真实照片提取几何形态，转成克制的极简图形海报。'])throw Error('安装包缺少 Skill 元数据双语资源。');
if(locale['设置']!=='Settings'||locale['保存原始 PNG']!=='Save original PNG')throw Error('安装包缺少中英双语资源。');
if(!extractFile(archive,path.join('desktop','installer-language.nsh')).toString().includes('InstallerLanguage'))throw Error('安装语言与应用语言衔接缺失。');
for(const name of ['yaml','electron-updater'])if(JSON.parse(extractFile(archive,path.join('node_modules',name,'package.json')).toString()).version!==pkg.dependencies[name])throw Error('安装包依赖与锁定版本不一致：'+name);
if(JSON.parse(extractFile(archive,path.join('node_modules','builder-util-runtime','package.json')).toString()).version!=='9.7.0')throw Error('更新运行库版本不符合安全基线。');
const name=`Skill-Canvas-${pkg.version}-Setup.exe`,installer=path.resolve('release',name),bytes=await readFile(installer),sha256=createHash('sha256').update(bytes).digest('hex');
const pe=bytes.readUInt32LE(0x3c),optional=pe+24,magic=bytes.readUInt16LE(optional),security=optional+(magic===0x20b?112:96)+4*8;
if(bytes.toString('ascii',pe,pe+4)!=='PE\u0000\u0000'||![0x20b,0x10b].includes(magic))throw Error('安装包不是有效 Windows PE。');
let signature='NotSigned';
if(bytes.readUInt32LE(security)&&bytes.readUInt32LE(security+4)){
 const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-Command','(Get-AuthenticodeSignature -LiteralPath $env:SKILL_CANVAS_INSTALLER).Status.ToString()'],{env:{...process.env,SKILL_CANVAS_INSTALLER:installer},windowsHide:true,timeout:60000});signature=stdout.trim();
}
if(process.argv.includes('--require-signature')&&signature!=='Valid')throw Error('正式签名发布门禁未通过：'+signature);
await writeFile(path.resolve('release',name+'.sha256'),`${sha256}  ${name}\n`);
const report={appVersion:pkg.version,platform:'win32-x64',artifact:name,bytes:bytes.length,sha256,archiveFileCount:files.length,bundledDataCheck:'PASS',languages:['zh-CN','en'],bilingualResourcesCheck:'PASS',personalProjectsBundled:false,thirdPartySkillsBundled:false,signature,distribution:signature==='Valid'?'signed':'unsigned-preview',independentCleanMachineAcceptance:'pending',automaticUpdatesEnabled:false};
await writeFile(path.resolve('release',`release-${pkg.version}-verification.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
