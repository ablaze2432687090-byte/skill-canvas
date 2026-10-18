import {confirmAction} from '../components/AppDialogs';
import {t,ui} from './i18n';
export async function confirmDeletion(ids:string[],manage:(action:string,input:Record<string,unknown>)=>Promise<unknown>,real:boolean){
 let detail='';if(real){const value=await manage('delete-impact',{ids}) as {projects:number;versions:number;originals:number;references:number;exclusiveThreads:number;sharedThreads:number;blocked:boolean};if(value.blocked)throw Error('请先取消正在执行或排队的任务，再删除项目。');detail=ui`项目 ${value.projects} · 版本 ${value.versions} · 原图 ${value.originals} · 参考图 ${value.references} · 独占线程 ${value.exclusiveThreads} · 保留共享线程 ${value.sharedThreads}`;}
 return await confirmAction(t('永久删除所选项目及其原图、参考图、历史版本和独占线程？不可恢复；外部导出与备份不受影响。')+'\n'+detail);
}
