import { t } from '../application/i18n';
import { useCanvas } from '../application/CanvasProvider';
export function SaveIndicator() {
  const { saveState, savingMessage, retrySave } = useCanvas();
  return <div className={`save-indicator ${saveState}`} role="status" aria-live="polite">{saveState === 'saved' ? t("已保存到本地") : saveState === 'saving' ? t("正在保存…") : t("保存失败")}{saveState === 'failed' && <><span>{t(savingMessage)}</span><button type="button" onClick={() => { void retrySave().catch(() => {}); }}>{t("重试保存")}</button></>}</div>;
}
