function officialReleasesUrl(config) {
  if(!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(config?.owner||'')||!/^[\w.-]{1,100}$/.test(config?.repo||'')||['.','..'].includes(config.repo))throw Error('官方更新仓库尚未配置。');
  return `https://github.com/${config.owner}/${config.repo}/releases`;
}
class ManualUpdates {
  constructor({config,version,notify=()=>{},fetcher=fetch}) {
    this.config=config;this.notify=notify;this.fetcher=fetcher;
    this.state={manual:true,currentVersion:version,releasesUrl:officialReleasesUrl(config),status:'idle',message:'通过官方 GitHub Releases 手动下载安装。不会自动执行更新。'};
  }
  snapshot(){return {...this.state};}
  set(patch){this.state={...this.state,...patch};this.notify(this.snapshot());return this.snapshot();}
  async check(){
    if(this.state.status==='checking')return this.snapshot();
    this.set({status:'checking',message:'正在检查官方发布版本…',version:undefined,releaseNotes:undefined});
    try{
      const response=await this.fetcher(`https://api.github.com/repos/${this.config.owner}/${this.config.repo}/releases/latest`,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
      if(response.status===404)return this.set({status:'no_release',message:'官方仓库尚无正式发布版本，可打开发布页查看预览版。'});
      if(!response.ok)throw Error('无法检查官方发布版本，请稍后重试或打开发布页。');
      let bytes=0;const parts=[];
      if(!response.body)throw Error('更新信息无效。');
      const reader=response.body.getReader();
      try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>512*1024)throw Error('更新信息超过安全限制。');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const release=JSON.parse(Buffer.concat(parts).toString('utf8'));
      if(release.draft||release.prerelease||!/^v?\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(release.tag_name||''))throw Error('官方版本信息无效，请打开发布页核对。');
      const version=release.tag_name.replace(/^v/,'');
      const remote=version.split('.').map(Number),local=this.state.currentVersion.split('.').map(Number);
      let newer=false;for(let i=0;i<3;i++){if(remote[i]!==local[i]){newer=remote[i]>local[i];break;}}
      return this.set({status:newer?'available':'current',version,releaseNotes:typeof release.body==='string'?release.body.slice(0,12000):'',message:newer?'发现新版本，请前往官方发布页下载安装。':'当前已是最新正式版本。'});
    }catch(error){return this.set({status:'error',message:error instanceof SyntaxError?'更新信息无效。':'无法检查官方发布版本，请稍后重试或打开发布页。'});}
  }
  async download(){throw Error('请从官方发布页手动下载安装包。');}
  async apply(){throw Error('请从官方发布页手动下载安装包。');}
}
module.exports={ManualUpdates,officialReleasesUrl};
