import { t, ui } from '../application/i18n';
import {useEffect,useState} from 'react';
import {Button} from './primitives';
import {Link, navigate} from '../application/router';
import {LanguageSettings} from './LanguageSettings';
import {useCanvas} from '../application/CanvasProvider';

export function DesktopEnvironmentPanel(){
 const desktop=window.skillCanvasDesktop;
 const {checkCodex}=useCanvas();
 const [environment,setEnvironment]=useState<DesktopEnvironment>(),[probe,setProbe]=useState<DesktopProbe>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{if(desktop)setEnvironment(await desktop.environment());};
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'检测未完成');}finally{setBusy(false);}};
 useEffect(()=>{if(desktop)void run(async()=>{await refresh();setProbe(await desktop.imageProbeState());});},[]);
 useEffect(()=>{if(probe?.status!=='running'||!desktop)return;const timer=window.setInterval(()=>{void desktop.imageProbeState().then(value=>{setProbe(value);if(value.status!=='running')void run(async()=>{await refresh();await checkCodex();});}).catch(e=>{setError(e instanceof Error?e.message:'检测连接中断，请重新检查。');setProbe({status:'failed',message:'检测连接中断，请重新检查。'});});},2000);return()=>clearInterval(timer);},[probe?.status]);
 if(!desktop)return null;
 return <section className="settings-section desktop-environment"><div className="section-heading"><div><h2>{t("使用准备")}</h2><p>{t("使用你自己的 Codex 账号，不需要 API Key。")}</p></div><Button disabled={busy||probe?.status==='running'} onClick={()=>void run(async()=>{await refresh();await checkCodex();})}>{t("检查环境")}</Button></div>
  <div className="setting-row"><span>{t("Codex 程序")}</span><span className="local-path">{environment?.codexPath||t("正在定位…")}</span></div>
  <div className="setting-row"><span>{t("ChatGPT 登录")}</span><span>{environment?environment.status.authenticated?t("已验证登录"):t("需要在 Codex 中登录"):t("正在检测…")}</span></div>
  <div className="setting-row"><span>{t("图片生成")}</span><span>{environment?.capabilities.automaticImageGeneration?t("本机实测通过"):t("尚未验证，不代表不可用")}</span></div>
  {environment?.status.error&&<p className="field-error">{t(environment.status.error.message)}</p>}
  <div className="settings-actions"><Button disabled={busy||probe?.status==='running'} onClick={()=>void run(async()=>{await desktop.chooseCodex();await refresh();await checkCodex();})}>{t("选择 Codex 程序")}</Button><Button variant="text" disabled={busy||probe?.status==='running'} onClick={()=>void run(async()=>{await desktop.chooseCodex(true);await refresh();await checkCodex();})}>{t("恢复自动定位")}</Button><Button variant="text" onClick={()=>void desktop.officialSetup()}>{t("安装与登录说明")}</Button></div>
  <div className="setting-row"><div><strong>{t("验证图片能力")}</strong><p>{t("真实生成一张测试图，会使用你的账号额度。不会自动执行或反复重试。")}</p></div><Button disabled={busy||!environment?.status.authenticated||probe?.status==='running'} onClick={()=>void run(async()=>setProbe(await desktop.startImageProbe()))}>{probe?.status==='running'?t("正在验证…"):t("生成测试图并验证")}</Button></div>
  {probe&&probe.status!=='idle'&&<p role="status" className={probe.status==='failed'?'field-error':'settings-hint'}>{t(probe.message)}</p>}{t(error)&&<p className="field-error" role="alert">{t(error)}</p>}
 </section>;
}
export function DesktopUpdatePanel(){
 const desktop=window.skillCanvasDesktop;
 const [state,setState]=useState<DesktopUpdate>(),[error,setError]=useState('');
 useEffect(()=>{if(!desktop)return;void desktop.updateState().then(setState).catch(()=>setError('无法读取更新状态。'));return desktop.onUpdate(setState);},[]);
 if(!desktop)return null;
 const action=async(fn:()=>Promise<DesktopUpdate>)=>{setError('');try{setState(await fn());}catch(e){setError(e instanceof Error?e.message:'更新操作未完成');}};
 return <section className="settings-section desktop-updates"><div className="section-heading"><div><h2>{t("应用与更新")}</h2><p>Skill Canvas {state?.currentVersion||'…'}</p></div><Button disabled={!state||['checking','downloading','downloaded'].includes(state.status)} onClick={()=>void action(()=>desktop.checkUpdates())}>{t("检查应用更新")}</Button></div><p className="settings-hint" role="status">{t(state?.message)}{state?.status==='downloading'?` ${state.percent||0}%`:''}</p><p className="settings-hint">{t("应用更新与 Skill 更新独立。不会覆盖你的项目、图片或自行安装的 Skill。")}</p><div className="settings-actions">{!state?.manual&&state?.status==='available'&&<Button onClick={()=>void action(()=>desktop.downloadUpdate())}>{t("下载 ")}{state.version}</Button>}{!state?.manual&&state?.status==='downloaded'&&<Button onClick={()=>void action(()=>desktop.installUpdate())}>{t("保存并重启安装")}</Button>}{state?.manual&&<Button onClick={()=>void desktop.openReleases()}>{t('打开官方发布页')}</Button>}</div>{state?.releaseNotes&&<section className="settings-subsection"><h2>{t('更新说明')}</h2><pre className="diagnostic-report">{state.releaseNotes}</pre></section>}{t(error)&&<p role="alert" className="field-error">{t(error)}</p>}</section>;
}
export function DesktopSetup(){
 const desktop=window.skillCanvasDesktop;
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[step,setStep]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!desktop)return;void Promise.all([desktop.info(),desktop.setupStep()]).then(([info,saved])=>{setStep(saved);setOpen(!info.onboardingComplete);}).catch(()=>{});const reopen=()=>setOpen(true);window.addEventListener('skill-canvas:open-setup',reopen);return()=>window.removeEventListener('skill-canvas:open-setup',reopen);},[]);
 const change=async(next:number)=>{if(!desktop||busy)return;setBusy(true);setError('');try{await desktop.saveSetupStep(next);setStep(next);}catch{setError('无法保存准备状态，请重试。');}finally{setBusy(false);}};
 const finish=async(destination?:string)=>{if(!desktop||busy)return;setBusy(true);try{await desktop.completeSetup();setOpen(false);if(destination)navigate(destination);}catch{setError('无法保存准备状态，请重试。');}finally{setBusy(false);}};
 if(!desktop||!open)return null;
 return <div className="setup-overlay"><section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title"><h1 id="setup-title">{t("准备好你的创作环境")}</h1><nav className="settings-actions" aria-label={t('首次使用引导')}>{['语言','使用准备','添加 Skill','开始创作'].map((label,index)=><Button key={label} disabled={busy} aria-current={step===index?'step':undefined} onClick={()=>void change(index)}>{index+1}. {t(label)}</Button>)}</nav>
 {step===0&&<LanguageSettings/>}{step===1&&<DesktopEnvironmentPanel/>}
 {step===2&&<section className="settings-section"><h2>{t('添加第一个 Skill')}</h2><p>{t('安装包不包含私人 Skill。可通过 GitHub、文件夹或 ZIP 导入；先检查来源、许可与依赖，再确认安装。')}</p><Button onClick={()=>void finish('/manage?install=1')}>{t('前往添加 Skill')}</Button></section>}
 {step===3&&<section className="settings-section"><h2>{t('开始创作')}</h2><p>{t('从 Skill 库选择风格，输入需求与参考图，再在 Codex 中生成。')}</p><Button onClick={()=>void finish('/skills')}>{t('打开 Skill 库')}</Button></section>}
 <p className="settings-hint">{t('本地管理不等于离线生成。生成时提示词和参考图会交给 Codex，使用你自己的账号与额度；请勿提交敏感资料。')}</p>{error&&<p className="field-error" role="alert">{t(error)}</p>}<div className="settings-actions">{step>0&&<Button disabled={busy} onClick={()=>void change(step-1)}>{t('上一步')}</Button>}{step<3&&<Button variant="primary" disabled={busy} onClick={()=>void change(step+1)}>{t('下一步')}</Button>}<Button disabled={busy} variant="text" onClick={()=>void finish()}>{t('进入 Skill Canvas')}</Button><span className="muted">{t('也可以先浏览，之后在设置中完成验证。')}</span></div></section></div>;
}

export function DesktopDiagnostics(){
 const desktop=window.skillCanvasDesktop;const [report,setReport]=useState<Record<string,unknown>>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(!desktop)return null;
 const run=async(copy=false)=>{setBusy(true);setMessage('');try{setReport(await(copy?desktop.copyDiagnostics():desktop.diagnostics()));if(copy)setMessage('诊断已复制。');}catch{setMessage('诊断读取失败，请重试。');}finally{setBusy(false);}};
 return <section className="settings-section"><div className="section-heading"><div><h2>{t('排障与诊断')}</h2><p>{t('仅包含版本、连接与验证状态，不含路径、提示词、图片或登录凭证。')}</p></div><Button onClick={()=>window.dispatchEvent(new Event('skill-canvas:open-setup'))}>{t('重新打开使用引导')}</Button></div><div className="settings-actions"><Button disabled={busy} onClick={()=>void run()}>{t('查看诊断')}</Button><Button disabled={busy} onClick={()=>void run(true)}>{t('复制诊断')}</Button><Button disabled={busy} onClick={()=>void desktop.exportDiagnostics().then(value=>{if(value)setReport(value);}).catch(()=>setMessage('诊断导出失败，请重试。'))}>{t('导出脱敏诊断')}</Button><Button onClick={()=>void desktop.reveal('logs')}>{t('打开日志目录')}</Button></div>{report&&<pre className="diagnostic-report">{JSON.stringify(report,null,2)}</pre>}{message&&<p role="status">{t(message)}</p>}</section>;
}
export function DesktopUpdateNotice(){
 const desktop=window.skillCanvasDesktop;const [state,setState]=useState<DesktopUpdate>();
 useEffect(()=>{if(!desktop)return;void desktop.updateState().then(setState).catch(()=>{});return desktop.onUpdate(setState);},[]);
 if(!state||!['available','downloaded'].includes(state.status))return null;
 return <div className="desktop-update-notice" role="status">{state.status==='available'?ui`发现新版本 ${state.version}`:t("应用更新已下载")}<Link href="/settings">{t("前往设置处理 →")}</Link></div>;
}
