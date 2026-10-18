import { useState } from 'react';
import { useCanvas } from '../application/CanvasProvider';
import { t, type Language } from '../application/i18n';

export function LanguageSettings() {
  const { settings, updateSettings } = useCanvas();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function select(language: Language) {
    if (busy || settings.language === language) return;
    setBusy(true); setError('');
    try { await window.skillCanvasDesktop?.setLanguage(language); updateSettings({ language }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '语言保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <section className="settings-section language-settings" aria-labelledby="language-title"><div className="section-heading"><div><h2 id="language-title">{t('语言')}</h2><p>{t('仅切换界面语言，不改变提示词、Skill 原文或生成内容。')}</p></div><div className="theme-options language-mode-options" role="group" aria-label={t('界面语言')}>{(['zh-CN', 'en'] as const).map(language => <button key={language} type="button" disabled={busy} aria-pressed={settings.language === language} onClick={() => void select(language)}>{language === 'en' ? 'English' : t("简体中文")}</button>)}</div></div>{error && <p role="alert" className="field-error">{t(error)}</p>}</section>;
}
