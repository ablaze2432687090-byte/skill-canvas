const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu, utilityProcess, session, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const {DesktopUpdates}=require('./updates.cjs');
const {ManualUpdates,officialReleasesUrl}=require('./manual-updates.cjs');
const {createDiagnostics}=require('./diagnostics.cjs');
const {exportName,exportOriginals}=require('./export.cjs');
const releaseConfig=require('./release.json');
const {english,translate,dialogOptions,initialLanguage}=require('./i18n.cjs');
const text=value=>translate(value,runtimeSettings.language);
// Native dialogs use the same language as the React UI, without translating file paths.
for(const name of ['showMessageBox','showOpenDialog','showSaveDialog']){
  const original=dialog[name].bind(dialog);
  dialog[name]=(owner,options)=>original(owner,dialogOptions(options,runtimeSettings.language));
}
const appVersion=app.getVersion?.()||require('../package.json').version;
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('Skill Canvas');
// AppData may be MSIX-virtualized when launched by Codex. Documents is app-independent.
const oldDesktopProfile = path.join(app.getPath('appData'), 'Skill Canvas');
const profile = process.env.SKILL_CANVAS_PROFILE || path.join(app.getPath('documents'), 'Skill Canvas');
app.setPath('userData', path.resolve(profile));
if (!app.requestSingleInstanceLock()) app.quit();
let window, child, config, starting, exiting = false, plannedStop = false, startupError = '', needsMigration = false, legacyWorkspace, data, exportDirectory, runtimeSettings={}, updates, updateEngine, installPending=false;
const pending = new Map(); let sequence=0;
const flushRequests = new Map(); let closePending=false;
const ownedCodex = new Set();
let restoreStatus={status:'idle',message:''},exportBusy=false,portableWriter;
function bridgeGone(own,code) {
  if(child!==own)return;
  child=null;config=null;
  for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Bridge 已停止。'));}pending.clear();
  if(!plannedStop&&!exiting){void killOwnedCodex();startupError='本地服务意外停止。未完成任务将在恢复后标记为中断。';void log('bridge-exit',String(code));window?.webContents.send('desktop:service',{ready:false,message:startupError});}
}
app.on('child-process-gone',(_event,details)=>{if(details.name==='Skill Canvas Bridge'&&child&&!app.getAppMetrics().some(metric=>metric.pid===child.pid))bridgeGone(child,details.exitCode);});
const bundleRoot = app.getAppPath(),defaultDataRoot=path.join(app.getPath('userData'),'Skill Canvas Data');
let dataRoot=defaultDataRoot,dataLocationError='',migrationBusy=false,dataIdentity;
async function log(event, code = '') {
  // Failed migration must not create its destination before a retry.
  const directory=needsMigration||dataLocationError?path.join(app.getPath('userData'),'StartupLogs'):path.join(dataRoot,'Logs');
  await fs.mkdir(directory,{recursive:true});
  const file=path.join(directory,'desktop.log');
  const size=await fs.stat(file).catch(()=>({size:0}));
  if(size.size>2*1024*1024) await fs.rename(file,file+'.previous').catch(()=>{});
  // No Prompt, image bytes, raw Codex stderr or credential contents.
  await fs.appendFile(file,JSON.stringify({at:new Date().toISOString(),event,code:String(code).replace(/[^A-Z0-9_-]/gi,'').slice(0,80)})+'\n').catch(()=>{});
}
function assertSender(event) { const url=new URL(event.senderFrame.url);if (!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || url.protocol!=='app:' || url.host!=='canvas') throw new Error('拒绝非应用窗口请求。'); }
function handle(name,fn){ipcMain.handle('desktop:'+name,async(event,...args)=>{assertSender(event);try{if(migrationBusy&&!['info','connection','translations','restore-state'].includes(name))throw Error('数据迁移正在进行，请等待完成。');return await fn(...args);}catch(error){error.message=text(error.message);throw error;}});}
async function bridgeApi(route) {
  if(!config) throw new Error('本地服务未连接，请重新启动 Bridge。');
  const response=await fetch(config.base+route,{headers:{Origin:'app://canvas','X-Skill-Canvas-Token':config.token},signal:AbortSignal.timeout(60000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'本地服务请求失败。');return result;
}
function command(type){return new Promise((resolve,reject)=>{if(!child)return reject(new Error('本地服务未连接。')); const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('本地服务未响应。'));},5000);pending.set(id,{resolve,reject,timer});child.postMessage({type,id});});}
async function findCodex() {
  const {discoverCodex}=await import('./environment.mjs');
  return discoverCodex({explicit:runtimeSettings.codexPath,execute,exists:data.exists});
}
let settingsSave=Promise.resolve();
function saveDesktop(patch){settingsSave=settingsSave.catch(()=>{}).then(async()=>{const previous=await fs.readFile(path.join(dataRoot,'Settings/desktop.json'),'utf8').then(JSON.parse).catch(()=>({}));runtimeSettings={...previous,...patch};await data.atomicJson(path.join(dataRoot,'Settings/desktop.json'),runtimeSettings);});return settingsSave;}
async function killOwnedCodex(){const pids=[...ownedCodex];ownedCodex.clear();await Promise.all(pids.map(pid=>execute('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:5000}).catch(()=>{})));} async function stopBridge(){const old=child;if(!old){plannedStop=false;return;}plannedStop=true;await killOwnedCodex(); await new Promise(resolve=>{const timeout=setTimeout(()=>{if(old.pid)execute('taskkill.exe',['/PID',String(old.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});old.kill();resolve();},5000);old.once('exit',()=>{clearTimeout(timeout);resolve();});old.postMessage({type:'shutdown'});});child=null;config=null;plannedStop=false;}
async function startBridge({reload=true}={}){
  if(starting)return starting;
  starting=(async()=>{
    if(dataLocationError)throw Error(dataLocationError);
    await stopBridge();await data.initializeData(dataRoot,appVersion);
    dataIdentity=await (await import('./identity.mjs')).ensureDataIdentity(dataRoot);
    await saveDesktop({language:runtimeSettings.language});
    const executable=await findCodex();
    const childPath=path.join(bundleRoot.replace(/app\.asar$/,'app.asar.unpacked'),'desktop-dist/bridge.mjs');
    const actual=app.isPackaged?childPath:path.join(bundleRoot,'desktop-dist/bridge.mjs');
    child=utilityProcess.fork(actual,[],{cwd:dataRoot,env:{...process.env,SKILL_CANVAS_DESKTOP:'1',SKILL_CANVAS_DATA_ROOT:dataRoot,SKILL_CANVAS_CODEX:executable},stdio:'pipe',serviceName:'Skill Canvas Bridge'});
    const own=child;own.stderr?.on('data',()=>{});own.stdout?.on('data',()=>{});
    // Windows external termination can precede the UtilityProcess exit callback.
    const monitor=setInterval(()=>{if(child!==own){clearInterval(monitor);return;}if(own.pid&&!app.getAppMetrics().some(metric=>metric.pid===own.pid)){clearInterval(monitor);bridgeGone(own,'PROCESS_GONE');}},2000);monitor.unref();
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Bridge 启动超时。')),15000);
      own.on('message',message=>{
        if(message.type==='owned-codex'&&Number.isInteger(message.pid))ownedCodex.add(message.pid);
        if(message.type==='codex-exit')ownedCodex.delete(message.pid);
        if(message.type==='ready'){config={base:message.base,token:message.token};clearTimeout(timeout);resolve();}
        if(message.type==='fatal'){clearTimeout(timeout);reject(new Error(message.code));}
        if(message.type==='log')void log(message.event,message.code);
        const request=pending.get(message.id);if(request){clearTimeout(request.timer);pending.delete(message.id);message.error?request.reject(new Error(message.error)):request.resolve(message.result);}
      });
      own.once('exit',code=>{clearTimeout(timeout);clearInterval(monitor);bridgeGone(own,code);reject(new Error('Bridge 启动失败。'));});
    });
    startupError='';window?.webContents.send('desktop:service',{ready:true});if(reload)await window.loadURL('app://canvas/');await log('bridge-ready');
  })().catch(async error=>{startupError=error.message;await log('bridge-start-failed','START_FAILED');await window.loadURL('app://canvas/desktop/startup.html');throw error;}).finally(()=>{starting=null;});
  return starting;
}
async function reveal(kind,id,outputId){
  let candidate;
  if(kind==='data')candidate=dataRoot;
  else if(kind==='logs')candidate=path.join(dataRoot,'Logs');
  else if(kind==='skills')candidate=path.join(dataRoot,'Skills');
  else if(kind==='project'&&/^[0-9a-f-]{36}$/i.test(id))candidate=path.join(dataRoot,'Projects',id);
  else if(kind==='output'){const task=await bridgeApi('/tasks/'+id);candidate=task.result?.outputs?.find(o=>o.id===outputId)?.path;}
  else if(kind==='skill'){const skills=await bridgeApi('/skills');candidate=skills.find(s=>s.id===id&&s.installation.rootId==='managed')?.source.path;}
  if(!candidate)throw new Error('找不到正式文件位置。');
  const safe=candidate===dataRoot?await fs.realpath(dataRoot):await data.safeExisting(dataRoot,candidate);
  const info=await fs.stat(safe);if(info.isDirectory()){const error=await shell.openPath(safe);if(error)throw new Error('无法打开文件夹。');}else shell.showItemInFolder(safe);return true;
}
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
app.whenReady().then(async()=>{
  data=await import('./data.mjs');
  portableWriter=new (await import('./portable.mjs')).PortableWriter(app.getPath('userData'));
  await portableWriter.cleanExpired().catch(()=>{});
  try{dataRoot=await (await import('./location.mjs')).loadDataLocation(app.getPath('userData'),defaultDataRoot);}catch{dataLocationError='保存的数据目录当前不可用，请重新连接数据目录；不会创建空库或覆盖旧数据。';startupError=dataLocationError;}
  Menu.setApplicationMenu(null);
  runtimeSettings=await fs.readFile(path.join(dataRoot,'Settings/desktop.json'),'utf8').then(JSON.parse).catch(()=>({}));exportDirectory=runtimeSettings.exportDirectory;
  nativeTheme.themeSource=runtimeSettings.theme==='gold'?'dark':['light','dark','system'].includes(runtimeSettings.theme)?runtimeSettings.theme:'dark';
  runtimeSettings.language=await initialLanguage({saved:runtimeSettings.language,system:app.getLocale(),execute});
  // Only an explicit local migration selection or the old app profile is considered.
  // Distributed builds never contain or auto-discover the developer's workspace.
  legacyWorkspace=process.env.SKILL_CANVAS_LEGACY_WORKSPACE;
  if(!process.env.SKILL_CANVAS_PROFILE&&!process.env.SKILL_CANVAS_LEGACY_WORKSPACE && await data.exists(path.join(oldDesktopProfile,'Skill Canvas Data'))) legacyWorkspace=oldDesktopProfile;
  needsMigration=!dataLocationError&&!await data.exists(dataRoot)&&legacyWorkspace&&await data.exists(path.join(legacyWorkspace,'Skill Canvas Data'));
  protocol.handle('app',async request=>{
    const url=new URL(request.url);if(url.host!=='canvas')return new Response('',{status:403});
    let relative;try{relative=decodeURIComponent(url.pathname);}catch{return new Response('',{status:400});}
    const desktop=relative.startsWith('/desktop/'),root=path.join(bundleRoot,desktop?'desktop':'dist');
    if(desktop&&!['/desktop/startup.html','/desktop/startup.css','/desktop/startup.js'].includes(relative))return new Response('',{status:403});
    let file=path.resolve(root,'.'+(desktop?relative.slice(8):relative));
    if(!data.contained(root,file)&&file!==root)return new Response('',{status:403});
    if(!desktop&&(!path.extname(file)||file===root))file=path.join(root,'index.html');
    try {let bytes=await fs.readFile(file);if(path.extname(file)==='.html')bytes=Buffer.from(bytes.toString('utf8').replace('<html lang="zh-CN">',`<html lang="${runtimeSettings.language}" data-language="${runtimeSettings.language}" data-theme="${runtimeSettings.theme==='gold'?'gold':!nativeTheme.shouldUseDarkColors?'light':'dark'}">`).replace('>正在启动<','>'+text('正在启动')+'<').replace('>正在准备本地数据与创作服务。<','>'+text('正在准备本地数据与创作服务。')+'<').replace('>查看详情<','>'+text('查看详情')+'<'));const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';return new Response(bytes,{headers:{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' http://127.0.0.1:*; object-src 'none'; base-uri 'self'; frame-src 'none'",'X-Content-Type-Options':'nosniff'}});}catch{return new Response('',{status:404});}
  });
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window=new BrowserWindow({width:1440,height:1000,minWidth:1280,minHeight:800,backgroundColor:runtimeSettings.theme==='gold'?'#242321':!nativeTheme.shouldUseDarkColors?'#fafafb':'#101112',title:'Skill Canvas',autoHideMenuBar:true,icon:path.join(bundleRoot,'desktop-dist/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:!app.isPackaged}});
  updateEngine=require('electron-updater').autoUpdater;
  const UpdateController=releaseConfig.owner&&releaseConfig.repo&&!releaseConfig.publisherName?ManualUpdates:DesktopUpdates;
  updates=new UpdateController({updater:updateEngine,config:releaseConfig,packaged:app.isPackaged,version:appVersion,notify:state=>window?.webContents.send('desktop:update',state),verifyConfiguration:async()=>{
    const disk=require('yaml').parse(await fs.readFile(path.join(process.resourcesPath,'app-update.yml'),'utf8'));
    const names=Array.isArray(disk.publisherName)?disk.publisherName:[disk.publisherName];
    if(disk.provider!=='github'||disk.owner!==releaseConfig.owner||disk.repo!==releaseConfig.repo||JSON.stringify(names)!==JSON.stringify(releaseConfig.publisherName)||typeof updateEngine.verifyUpdateCodeSignature!=='function')throw Error('更新源或签名发布者不匹配。');
  },install:async()=>{
    if((await command('active')).length)throw Error('请先完成或取消生成任务，再安装更新。');
    const answer=await dialog.showMessageBox(window,{type:'question',message:'保存当前草稿并重启安装更新？项目、Skill 与图片会保留。',buttons:['稍后','重启安装'],defaultId:0,cancelId:0});if(answer.response===1){installPending=true;window.close();}
  }});
  window.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.protocol==='https:')void shell.openExternal(u.href);}catch{}return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('app://canvas/'))event.preventDefault();});
  window.webContents.on('render-process-gone',()=>{startupError='界面进程已退出，已保存的作品仍保留。';void log('renderer-exit','RENDERER_GONE');void window.loadURL('app://canvas/desktop/startup.html');});
  ipcMain.on('desktop:flushed',(event,value)=>{assertSender(event);const done=flushRequests.get(value.id);if(done){flushRequests.delete(value.id);done(value.ok===true);}});
  window.on('close',event=>{if(exiting)return;event.preventDefault();if(backupBusy||migrationBusy||exportBusy||portableWriter?.sessions.size||closePending)return;closePending=true;void(async()=>{
    let running;try{running=await command('active');}catch{running=[];}
    if(running.length){const choice=await dialog.showMessageBox(window,{type:'warning',title:'Skill Canvas',message:'当前仍有生成任务正在运行。',buttons:['继续使用','取消任务并退出'],defaultId:0,cancelId:0});if(choice.response===0)return;await command('cancel-all').catch(()=>{});}
    if(!window.webContents.getURL().includes('/desktop/')) {
      const id=++sequence;
      const flushed=await new Promise(resolve=>{const timeout=setTimeout(()=>{flushRequests.delete(id);resolve(false);},5000);flushRequests.set(id,ok=>{clearTimeout(timeout);resolve(ok);});window.webContents.send('desktop:flush',id);});
      if(!flushed){const choice=await dialog.showMessageBox(window,{type:'warning',message:'草稿保存尚未完成。已提交项目与正式原图仍保留。',buttons:['返回并重试保存','仍然退出'],defaultId:0,cancelId:0});if(choice.response===0)return;}
    }
    exiting=true;await stopBridge();window.destroy();if(installPending)updateEngine.quitAndInstall(false,true);else app.quit();
  })().finally(()=>{closePending=false;if(!exiting)installPending=false;});});
  handle('connection',()=>{if(!config)throw new Error('本地服务未连接，请重新启动 Bridge。');return config;});
  handle('info',async()=>({appVersion,dataId:dataIdentity?.cacheId,canImportLegacyCache:dataRoot===defaultDataRoot,dataLocationError,language:runtimeSettings.language,theme:['light','dark','gold','system'].includes(runtimeSettings.theme)?runtimeSettings.theme:undefined,dataSchemaVersion:1,dataRoot,skillRoot:path.join(dataRoot,'Skills'),logs:path.join(dataRoot,'Logs'),exportDirectory:exportDirectory||app.getPath('downloads'),needsMigration,legacyWorkspace,startupError,codexPath:await findCodex(),onboardingComplete:runtimeSettings.onboardingComplete===true||(runtimeSettings.onboardingComplete===undefined&&((await fs.readdir(path.join(dataRoot,'Projects')).catch(()=>[])).length>0||(await fs.readdir(path.join(dataRoot,'Skills')).catch(()=>[])).some(n=>n.startsWith('managed-')))),updates:updates.snapshot()}));
  handle('complete-setup',async()=>{await saveDesktop({onboardingComplete:true});return true;});
  handle('setup-progress',async step=>{if(!Number.isInteger(step)||step<0||step>3)throw Error('引导步骤无效。');await saveDesktop({onboardingStep:step});return true;});
  handle('setup-progress-state',()=>Number.isInteger(runtimeSettings.onboardingStep)&&runtimeSettings.onboardingStep>=0&&runtimeSettings.onboardingStep<=3?runtimeSettings.onboardingStep:0);
  async function diagnostics(){
    const [status,capabilities,probe]=await Promise.all([bridgeApi('/status').catch(()=>null),bridgeApi('/capabilities').catch(()=>null),command('probe-state').catch(()=>null)]);
    return createDiagnostics({version:appVersion,platform:process.platform,arch:process.arch,bridgeReady:!!config,status,capabilities,probe,language:runtimeSettings.language});
  }
  handle('diagnostics',diagnostics);
  handle('export-diagnostics',async()=>{const report=await diagnostics();const choice=await dialog.showSaveDialog(window,{title:'导出脱敏诊断',defaultPath:path.join(app.getPath('downloads'),'Skill-Canvas-Diagnostics.json'),filters:[{name:'JSON',extensions:['json']}]});if(choice.canceled)return null;await fs.writeFile(choice.filePath,JSON.stringify(report,null,2));return report;});
  handle('copy-diagnostics',async()=>{const report=await diagnostics();require('electron').clipboard.writeText(JSON.stringify(report,null,2));return report;});
  handle('open-releases',()=>shell.openExternal(officialReleasesUrl(releaseConfig)));
  handle('translations',()=>runtimeSettings.language==='en'?english:{});
  handle('set-language',async language=>{if(!['zh-CN','en'].includes(language))throw Error('Invalid interface language.');await saveDesktop({language});return language;});
  handle('restore-state',()=>restoreStatus);
  handle('set-theme',async theme=>{if(!['light','dark','gold','system'].includes(theme))throw Error('界面模式无效。');await saveDesktop({theme});nativeTheme.themeSource=theme==='gold'?'dark':theme;window.setBackgroundColor(theme==='gold'?'#242321':!nativeTheme.shouldUseDarkColors?'#fafafb':'#101112');return theme;});
  handle('environment',async()=>({codexPath:await findCodex(),status:await bridgeApi('/status'),capabilities:await bridgeApi('/capabilities')}));
  handle('pick-codex',async reset=>{
    if((await command('active')).length)throw Error('生成或检测正在运行，请稍后切换 Codex。');
    if(reset===true){await saveDesktop({codexPath:null});await startBridge();return findCodex();}
    const selection=await dialog.showOpenDialog(window,{title:'选择本机 codex.exe 或 codex.cmd',properties:['openFile'],filters:[{name:'Codex executable',extensions:['exe','cmd','ps1']}]});if(selection.canceled)return null;
    const selected=selection.filePaths[0];if(!/^codex\.(exe|cmd|ps1)$/i.test(path.basename(selected)))throw Error('请选择 codex.exe 或 codex.cmd，而不是 Codex 桌面应用的主程序。');
    const {resolveCodexExecutable}=await import('./environment.mjs');const file=await resolveCodexExecutable(selected,{exists:data.exists});
    const version=await execute(file,['--version'],{windowsHide:true,timeout:10000});if(!/codex-cli \d+\.\d+\.\d+/.test(version.stdout))throw Error('所选程序不是可识别的 Codex CLI。');
    await saveDesktop({codexPath:file});await startBridge();return file;
  });
  handle('probe-start',()=>command('probe-start'));
  handle('probe-state',()=>command('probe-state'));
  handle('update-state',()=>updates.snapshot());
  handle('update-check',()=>updates.check());
  handle('update-download',()=>updates.download());
  handle('update-install',()=>updates.apply());
  handle('official-setup',()=>shell.openExternal('https://developers.openai.com/codex/app/'));
  let backupBusy=false;
  handle('backup-schedule-failed',async()=>{if(runtimeSettings.backupSchedule?.enabled)await saveDesktop({backupSchedule:{...runtimeSettings.backupSchedule,error:'自动备份未完成，请检查目标磁盘与可用空间。'}});return true;});
  handle('backup-schedule',()=>runtimeSettings.backupSchedule||{enabled:false,hours:24,keep:3,includeDrafts:true});
  handle('save-backup-schedule',async input=>{
    if(backupBusy||migrationBusy)throw Error('已有数据操作正在进行。');
    if(!input||typeof input.enabled!=='boolean'||![24,72,168].includes(input.hours)||![1,3,7,14].includes(input.keep)||typeof input.includeDrafts!=='boolean')throw Error('定时备份设置无效。');
    let directory=runtimeSettings.backupSchedule?.directory;
    if(input.enabled&&(!directory||input.chooseDirectory)){const choice=await dialog.showOpenDialog(window,{title:'选择自动备份位置',properties:['openDirectory']});if(choice.canceled)return runtimeSettings.backupSchedule||{enabled:false,hours:24,keep:3,includeDrafts:true};directory=await fs.realpath(choice.filePaths[0]);}
    if(directory&&(directory===dataRoot||data.contained(dataRoot,directory)))throw Error('备份位置不能在数据目录内部。');
    const value={enabled:input.enabled,hours:input.hours,keep:input.keep,includeDrafts:input.includeDrafts,directory,lastSuccess:runtimeSettings.backupSchedule?.lastSuccess||null,error:''};await saveDesktop({backupSchedule:value});return value;
  });
  handle('run-scheduled-backup',async token=>{
    const plan=runtimeSettings.backupSchedule;
    if(!plan?.enabled||!plan.directory||Date.now()-Date.parse(plan.lastSuccess||'1970-01-01')<plan.hours*3600000)return {skipped:true};
    if(backupBusy||migrationBusy||exportBusy||(await command('active')).length)return {skipped:true};
    if(plan.includeDrafts&&(!token||!portableWriter.session(token).ready))throw Error('草稿快照尚未完成。');
    backupBusy=true;window.setEnabled(false);
    try{await settingsSave;if((await command('active')).length)throw Error('有新任务开始，备份尚未启动。');await stopBridge();const result=await (await import('./backup.mjs')).backupData(dataRoot,plan.directory,appVersion,{draftWriter:portableWriter,draftToken:plan.includeDrafts?token:undefined,automatic:true});
      await saveDesktop({backupSchedule:{...plan,lastSuccess:new Date().toISOString(),error:''}});
      const removed=await (await import('./retention.mjs')).pruneBackups(plan.directory,plan.keep);return {...result,removed};
    }catch(error){await saveDesktop({backupSchedule:{...plan,error:'自动备份未完成，请检查目标磁盘与可用空间。'}});throw error;}
    finally{try{if(!child)await startBridge({reload:false});}finally{backupBusy=false;if(token)await portableWriter.release(token);window.setEnabled(true);}}
  });
  handle('draft-backup-begin',async(state,assets)=>{if(backupBusy||migrationBusy)throw Error('已有数据操作正在进行。');return portableWriter.begin(state,assets,dataRoot);});
  handle('draft-backup-asset',(token,asset)=>portableWriter.add(token,asset));
  handle('draft-backup-finish',token=>portableWriter.finish(token));
  handle('draft-backup-cancel',token=>portableWriter.release(token));
  handle('backup-data',async draftToken=>{
    if(draftToken&&!portableWriter.session(draftToken).ready)throw Error('草稿快照尚未完成。');
    if(backupBusy)throw Error('已有备份正在进行。');
    if((await command('active')).length)throw Error('请先完成或取消生成与检测任务，再备份正式数据。');
    const result=await dialog.showOpenDialog(window,{title:'选择备份保存位置（包含私人作品，请妥善保存）',properties:['openDirectory']});if(result.canceled){if(draftToken)await portableWriter.release(draftToken);return null;}
    backupBusy=true;window.setEnabled(false);
    try{if((await command('active')).length)throw Error('有新任务开始，备份尚未启动。');await stopBridge();const {backupData}=await import('./backup.mjs');return await backupData(dataRoot,result.filePaths[0],appVersion,{draftWriter:portableWriter,draftToken});}
    finally{try{if(!child)await startBridge({reload:false});}finally{backupBusy=false;if(draftToken)await portableWriter.release(draftToken);window.setEnabled(true);}}
  });
  handle('restart',async()=>{await startBridge();return true;});
  handle('restore-data',async draftToken=>{
    if(!draftToken||!portableWriter.session(draftToken).ready)throw Error('恢复前请先保存当前草稿快照。');
    if(backupBusy)throw Error('已有备份或恢复正在进行。');
    if((await command('active')).length)throw Error('请先完成或取消生成与检测任务，再恢复。');
    const selected=await dialog.showOpenDialog(window,{title:'选择包含 backup-manifest.json 的备份目录',properties:['openDirectory']});if(selected.canceled){await portableWriter.release(draftToken);return null;}
    const summary=await (await import('./backup.mjs')).previewBackup(selected.filePaths[0]);
    const choice=await dialog.showMessageBox(window,{type:'warning',message:'恢复备份中的正式项目与 Skill？',detail:text('当前正式数据将完整保留为恢复前副本，不会永久删除。当前未提交草稿也会保存在恢复前副本中；恢复后需要重新验证图片能力。跨账号的 Codex 会话可能无法续改。')+'\n'+text('项目')+': '+summary.projects+' · '+text('文件')+': '+summary.files+' · '+(summary.bytes/1048576).toFixed(1)+' MB · '+text('包含草稿')+': '+(summary.drafts?text('是'):text('否')),buttons:['取消','校验并恢复'],defaultId:0,cancelId:0});if(choice.response!==1){await portableWriter.release(draftToken);return null;}
    backupBusy=true;restoreStatus={status:'running',message:'正在校验并恢复…'};window.setEnabled(false);let prepared;
    try{
      if((await command('active')).length)throw Error('有新任务开始，恢复尚未启动。');
      const id=++sequence;
      const flushed=await new Promise(resolve=>{const timer=setTimeout(()=>{flushRequests.delete(id);resolve(false);},5000);flushRequests.set(id,ok=>{clearTimeout(timer);resolve(ok);});window.webContents.send('desktop:flush',id);});
      if(!flushed)throw Error('当前草稿未完成保存，恢复已取消。');
      await stopBridge();const {prepareRestore,commitRestore}=await import('./backup.mjs');
      prepared=await prepareRestore(selected.filePaths[0],dataRoot,appVersion);
      // Unmount the editor before clearing its cache, so old state cannot be written back.
      const previousDrafts=path.join(dataRoot,'Settings/PortableDrafts');if(await data.exists(previousDrafts))throw Error('存在待处理的草稿副本，请先完成恢复后再试。');await portableWriter.copyTo(draftToken,previousDrafts);
      await window.loadURL('app://canvas/desktop/startup.html');
      // Restored data receives a fresh cache namespace. The old namespace stays recoverable.
      const result=await commitRestore(prepared);prepared=null;
      runtimeSettings=JSON.parse(await fs.readFile(path.join(dataRoot,'Settings/desktop.json'),'utf8'));
      restoreStatus={status:'completed',message:'备份已恢复。',previous:result.previous};
      await startBridge();await dialog.showMessageBox(window,{type:'info',message:'备份已恢复。请重新验证图片能力。',detail:result.previous?'恢复前正式数据保留在：'+result.previous:'正式数据已恢复到本机目录。'});return result;
    }catch(error){
      restoreStatus={status:'failed',message:error.message};
      await dialog.showMessageBox(window,{type:'error',message:'恢复未完成，原始备份未修改。',detail:error.message});throw error;
    }finally{
      if(prepared)await fs.rm(prepared.stage,{recursive:true,force:true});
      try{if(!child)await startBridge();}finally{backupBusy=false;await portableWriter.release(draftToken);window.setEnabled(true);}
    }
  });
  handle('reconnect-data-location',async()=>{
    if(backupBusy||exportBusy||(child&&(await command('active')).length))throw Error('请先完成或取消所有任务，再切换数据目录。');
    const choice=await dialog.showOpenDialog(window,{title:'重新连接 Skill Canvas Data 目录',properties:['openDirectory']});if(choice.canceled)return false;
    const location=await import('./location.mjs'),selected=await location.validateDataLocation(choice.filePaths[0]);
    migrationBusy=true;window.setEnabled(false);try{
    if(!dataLocationError){const id=++sequence,flushed=await new Promise(resolve=>{const timer=setTimeout(()=>{flushRequests.delete(id);resolve(false);},10000);flushRequests.set(id,ok=>{clearTimeout(timer);resolve(ok);});window.webContents.send('desktop:flush',id);});if(!flushed)throw Error('草稿或设置保存未完成，迁移已取消。');}
    await settingsSave;if(child&&(await command('active')).length)throw Error('有新任务开始，数据位置未切换。');await stopBridge();await location.saveDataLocation(app.getPath('userData'),selected);dataRoot=selected;dataLocationError='';runtimeSettings=await fs.readFile(path.join(dataRoot,'Settings/desktop.json'),'utf8').then(JSON.parse).catch(()=>({}));runtimeSettings.language=await initialLanguage({saved:runtimeSettings.language,system:app.getLocale(),execute});await startBridge();return true;}finally{migrationBusy=false;window.setEnabled(true);}
  });
  handle('migrate-data-location',async()=>{
    if(backupBusy||exportBusy||migrationBusy||portableWriter.sessions.size)throw Error('已有数据操作正在进行。');if((await command('active')).length)throw Error('请先完成或取消所有任务（包括排队任务），再迁移数据。');
    const choice=await dialog.showOpenDialog(window,{title:'选择新的数据保存位置（将创建 Skill Canvas Data）',properties:['openDirectory']});if(choice.canceled)return null;
    const answer=await dialog.showMessageBox(window,{type:'warning',message:'完整复制并校验项目、Skill、原图与设置后切换数据位置？',detail:'原目录会保留，不会删除。目标已存在、空间不足或校验失败时不会切换。迁移期间请勿关闭应用。',buttons:['取消','校验并迁移'],defaultId:0,cancelId:0});if(answer.response!==1)return null;
    migrationBusy=true;window.setEnabled(false);const original=dataRoot;let switched=false;
    try{
      const id=++sequence,flushed=await new Promise(resolve=>{const timer=setTimeout(()=>{flushRequests.delete(id);resolve(false);},10000);flushRequests.set(id,ok=>{clearTimeout(timer);resolve(ok);});window.webContents.send('desktop:flush',id);});if(!flushed)throw Error('草稿或设置保存未完成，迁移已取消。');
      await settingsSave;await stopBridge();const location=await import('./location.mjs'),report=await location.migrateDataLocation(original,choice.filePaths[0],{version:appVersion,onProgress:progress=>{try{window?.webContents.send('desktop:migration-progress',progress);}catch{}}});
      await location.saveDataLocation(app.getPath('userData'),report.target);dataRoot=report.target;switched=true;runtimeSettings=await fs.readFile(path.join(dataRoot,'Settings/desktop.json'),'utf8').then(JSON.parse);await startBridge();return report;
    }catch(error){
      if(switched){try{await (await import('./location.mjs')).saveDataLocation(app.getPath('userData'),original);dataRoot=original;runtimeSettings=await fs.readFile(path.join(dataRoot,'Settings/desktop.json'),'utf8').then(JSON.parse);}catch{dataLocationError='数据位置切换未完成，请重新连接原目录或已校验的迁移副本。';startupError=dataLocationError;}}
      if(!child)await startBridge().catch(()=>{});throw error;
    }finally{migrationBusy=false;window.setEnabled(true);}
  });
  handle('migrate',async mode=>{
    if(!needsMigration)throw new Error('无需迁移。');
    if(mode==='choose'){const selection=await dialog.showOpenDialog(window,{title:'选择旧 Skill Canvas 项目目录',properties:['openDirectory']});if(selection.canceled)return false;legacyWorkspace=selection.filePaths[0];mode='copy';}
    if(mode==='copy'){try {await data.migrateLegacy(legacyWorkspace,dataRoot);if(path.resolve(legacyWorkspace)===path.resolve(oldDesktopProfile))await data.copyVerifiedDirectory(path.join(oldDesktopProfile,'IndexedDB'),path.join(app.getPath('userData'),'IndexedDB'));}catch(error){await log('migration-failed','MIGRATION_FAILED');throw error;}await log('migration-completed');}
    else if(mode==='skip')await data.initializeData(dataRoot);else throw new Error('迁移操作无效。');
    needsMigration=false;exportDirectory=await fs.readFile(path.join(dataRoot,'Settings/desktop.json'),'utf8').then(JSON.parse).then(value=>value.exportDirectory).catch(()=>null);await startBridge();return true;
  });
  handle('export-directory',async reset=>{if(reset===true){exportDirectory=null;await saveDesktop({exportDirectory:null});return null;}const result=await dialog.showOpenDialog(window,{title:'选择默认 PNG 保存位置',properties:['openDirectory']});if(result.canceled)return null;exportDirectory=result.filePaths[0];await saveDesktop({exportDirectory});return exportDirectory;});
  handle('export-projects',async ids=>{
    if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))throw Error('请选择 1–200 个不同项目。');
    if(exportBusy)throw Error('已有导出正在进行。');exportBusy=true;
    try{const projects=await bridgeApi('/projects'),selected=ids.map(id=>projects.find(project=>project.id===id)||{id,tasks:[]});
    const choice=await dialog.showOpenDialog(window,{title:'选择原图导出目录',properties:['openDirectory']});if(choice.canceled)return null;
    return await exportOriginals({directory:choice.filePaths[0],projects:selected,readOutput:async(taskId,outputId)=>{const response=await fetch(config.base+`/tasks/${taskId}/outputs/${outputId}`,{headers:{Origin:'app://canvas','X-Skill-Canvas-Token':config.token},signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('原始 PNG 不可用。');return Buffer.from(await response.arrayBuffer());},onProgress:progress=>window?.webContents.send('desktop:export-progress',progress)});
    }finally{exportBusy=false;}
  });
  handle('save-png',async(taskId,outputId,suggestedName)=>{
    if(!/^[0-9a-f-]{36}$/i.test(taskId)||!/^[\w-]{1,80}$/.test(outputId))throw new Error('输出身份无效。');
    const task=await bridgeApi('/tasks/'+taskId),output=task.result?.outputs?.find(o=>o.id===outputId);if(!output)throw new Error('找不到输出原图。');
    if(suggestedName!==undefined&&(typeof suggestedName!=='string'||suggestedName.length>200))throw Error('导出文件名无效。');
    const result=await dialog.showSaveDialog(window,{title:'保存原始 PNG',defaultPath:path.join(exportDirectory||app.getPath('downloads'),`${suggestedName?exportName(suggestedName):outputId}.png`),filters:[{name:'PNG',extensions:['png']}]});if(result.canceled)return{cancelled:true};
    const response=await fetch(config.base+`/tasks/${taskId}/outputs/${outputId}`,{headers:{Origin:'app://canvas','X-Skill-Canvas-Token':config.token},signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('原始 PNG 文件不存在或校验失败。');
    const bytes=Buffer.from(await response.arrayBuffer()),hash=require('node:crypto').createHash('sha256');if(hash.update(bytes).digest('hex')!==output.sha256)throw new Error('PNG Hash 不一致。');
    const temporary=result.filePath+'.'+require('node:crypto').randomUUID()+'.tmp';await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,result.filePath);return{cancelled:false,path:result.filePath};
  });
  handle('reveal',reveal);
  handle('pick-skill-directory',async()=>{
    const result=await dialog.showOpenDialog(window,{title:'选择 Skill 文件夹',properties:['openDirectory']});if(result.canceled)return null;
    const root=result.filePaths[0],files=[];let size=0;
    async function walk(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(['.git','node_modules','.cache','.tmp'].includes(entry.name))continue;const candidate=path.join(directory,entry.name),stat=await fs.lstat(candidate);if(stat.isSymbolicLink())throw new Error('Skill 文件夹含有链接，拒绝导入。');if(stat.isDirectory())await walk(candidate);else if(stat.isFile()){size+=stat.size;if(stat.size>8*1024*1024||size>64*1024*1024||files.length>=500)throw new Error('文件夹超过导入大小或数量限制。');files.push({path:path.relative(root,candidate).replaceAll('\\','/'),data:(await fs.readFile(candidate)).toString('base64')});}}}
    await walk(root);return{type:'local',folder:path.basename(root),files};
  });
  if(needsMigration||dataLocationError)await window.loadURL('app://canvas/desktop/startup.html');else await startBridge().catch(()=>{});
  if(!updates.snapshot().manual&&updates.snapshot().status!=='unconfigured'){const timer=setTimeout(()=>void updates.check(),10000);timer.unref();}
}).catch(()=>{app.quit();});
app.on('window-all-closed',()=>{if(exiting)app.quit();});
app.on('before-quit',event=>{if(!exiting&&window&&!window.isDestroyed()){event.preventDefault();window.close();}});
