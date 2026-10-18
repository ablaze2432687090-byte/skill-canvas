import { t } from '../application/i18n';
import { version } from '../../package.json';
export function ReleaseStatus() {
  return <p className="release-status" title={t('1.0 正式版由作者确认后发布；当前版本用于测试。')}>Skill Canvas {version} · {t('测试版')}<span>{t('1.0 正式版由作者确认后发布；当前版本用于测试。')}</span></p>;
}
