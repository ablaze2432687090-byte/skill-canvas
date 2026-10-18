import {useEffect,useState} from 'react';
import {t} from '../application/i18n';
import {Button} from './primitives';
export function DesktopDataLocation(){
 const desktop=window.skillCanvasDesktop;const [info,setInfo]=useState<DesktopInfo>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 useEffect(()=>{if(!desktop)return;void desktop.info().then(setInfo).catch(()=>{});return desktop.onMigration?.(value=>setProgress(`${value.completed} / ${value.total}`));},[]);
 if(!desktop)return null;
 const migrate=async()=>{setBusy(true);setError('');try{await desktop.migrateDataLocation();setInfo(await desktop.info());}catch(error){setError(error instanceof Error?error.message:'迁移未完成，原数据仍保留。');}finally{setBusy(false);}};
 const reconnect=async()=>{setBusy(true);setError('');try{await desktop.reconnectDataLocation();setInfo(await desktop.info());}catch(error){setError(error instanceof Error?error.message:'重新连接未完成。');}finally{setBusy(false);}};
 return <section className="settings-section"><div className="section-heading"><div><h2>{t('数据位置')}</h2><p className="local-path">{info?.dataRoot||t('正在读取…')}</p></div><Button disabled={busy} onClick={()=>void migrate()}>{t('迁移数据目录')}</Button><Button disabled={busy} onClick={()=>void reconnect()}>{t('连接已有数据目录')}</Button></div><p className="settings-hint">{t('复制与校验完成后才切换，原目录保留。请选择空间充足的位置；迁移期间不能生成或关闭应用。')}</p>{progress&&<p role="status">{t('迁移进度')} {progress}</p>}{error&&<p className="field-error" role="alert">{t(error)}</p>}</section>;
}
