// The release feed is fixed by the build, never accepted from a renderer or Skill.
function releasePolicy(config) {
  if (!config?.owner && !config?.repo) return { enabled:false, message:'尚未连接 GitHub 发布仓库；应用采用手动下载安装更新，不会访问更新服务器。' };
  if (config.provider!=='github' || !/^[\w-]{1,39}$/.test(config.owner||'') || !/^[\w.-]{1,100}$/.test(config.repo||'') || ['.','..'].includes(config.repo)) throw Error('发布仓库配置无效。');
  if (!config.publisherName || !Array.isArray(config.publisherName) || !config.publisherName.length || config.publisherName.some(n=>typeof n!=='string'||!n.trim())) return { enabled:false, message:'尚未配置可信 Windows 签名发布者；自动更新未启用。' };
  return {enabled:true,feed:{provider:'github',owner:config.owner,repo:config.repo,private:false},message:'仅从固定 GitHub 仓库检查已签名的稳定版本。'};
}
class DesktopUpdates {
  constructor({updater,config,packaged,version,notify=()=>{},install=()=>{},verifyConfiguration=async()=>{}}) {
    this.policy=releasePolicy(config);this.updater=updater;this.notify=notify;this.install=install;this.verifyConfiguration=verifyConfiguration;
    this.state={status:packaged&&this.policy.enabled?'idle':'unconfigured',currentVersion:version,message:packaged?this.policy.message:'开发模式不检查或安装应用更新。'};
    if(this.state.status==='unconfigured')return;
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
    updater.setFeedURL(this.policy.feed);
    updater.on('checking-for-update',()=>this.set({status:'checking',message:'正在检查应用新版本…'}));
    updater.on('update-available',info=>this.set({status:'available',version:info.version,message:`发现新版本 ${info.version}；下载与安装需要你确认。`}));
    updater.on('update-not-available',()=>this.set({status:'current',message:'当前已是最新版本。'}));
    updater.on('download-progress',p=>this.set({status:'downloading',percent:Math.round(p.percent),message:'正在下载已发布更新…'}));
    updater.on('update-downloaded',info=>this.set({status:'downloaded',version:info.version,message:'更新已下载，将在保存并退出后安装。'}));
    updater.on('error',()=>this.set({status:'error',message:'更新检查或下载失败。现有应用和数据未改动，可稍后重试。'}));
  }
  set(patch){this.state={...this.state,...patch};this.notify(this.snapshot());}
  snapshot(){return {...this.state};}
  async check(){if(this.state.status==='unconfigured'||['checking','downloading','downloaded'].includes(this.state.status))return this.snapshot();try{await this.verifyConfiguration();await this.updater.checkForUpdates();}catch{this.set({status:'error',message:'更新源或签名配置校验失败，或网络不可用；未安装任何更新。'});}return this.snapshot();}
  async download(){if(this.state.status!=='available')throw Error('当前没有已确认的可下载更新。');this.set({status:'downloading',percent:0,message:'正在下载更新…'});try{await this.verifyConfiguration();await this.updater.downloadUpdate();}catch{this.set({status:'error',message:'下载或签名校验失败，未安装更新。'});}return this.snapshot();}
  async apply(){if(this.state.status!=='downloaded')throw Error('更新尚未下载并校验完成。');if(this.applying)return this.snapshot();this.applying=true;try{await this.install();return this.snapshot();}finally{this.applying=false;}}
}
module.exports={releasePolicy,DesktopUpdates};
