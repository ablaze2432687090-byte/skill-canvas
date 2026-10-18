import { t } from '../application/i18n';
import { useEffect, useState } from 'react';
import { Button } from './primitives';
import { useCanvas } from '../application/CanvasProvider';
export function DesktopServiceNotice() {
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const { checkCodex } = useCanvas();
  useEffect(() => window.skillCanvasDesktop?.onService(status => { setMessage(status.ready ? '' : status.message || '本地服务已停止。'); }), []);
  if (!window.skillCanvasDesktop || !message) return null;
  return <div role="alert" className="field-error">{t(message)} <Button variant="text" disabled={busy} onClick={async () => { setBusy(true); try { await window.skillCanvasDesktop!.restartBridge(); await checkCodex(); } catch (error) { setMessage(error instanceof Error ? error.message : '无法启动本地服务'); } finally { setBusy(false); } }}>{t("重新启动 Bridge")}</Button></div>;
}
