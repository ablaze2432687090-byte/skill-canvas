import english from '../../desktop/locales/en.json' with { type: 'json' };
import skillEnglish from '../../desktop/locales/skill-en.json' with { type: 'json' };

export type Language = 'zh-CN' | 'en';
const messages: Record<string, string> = { ...english, ...skillEnglish };
export const languageStorageKey = 'skill-canvas-language';
let language: Language = 'zh-CN';
export function normalizeLanguage(value: unknown): Language { return typeof value === 'string' && /^zh(?:-|$)/i.test(value) ? 'zh-CN' : 'en'; }
export function getLanguage(): Language { return language; }
export function applyLanguage(value: Language) {
  language = normalizeLanguage(value);
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  try { localStorage.setItem(languageStorageKey, language); } catch { /* Desktop settings remain authoritative. */ }
}
export function initializeLanguage() {
  let value = document.documentElement.dataset.language;
  try { value ||= localStorage.getItem(languageStorageKey) || undefined; } catch { /* Use system language. */ }
  applyLanguage(normalizeLanguage(value || navigator.language));
}
/** Translate authored UI only. Never pass user prompts or source documents here. */
export function t<T>(value: T): T {
  if (language !== 'en' || typeof value !== 'string') return value;
  const key = value.trim(), translated = messages[key];
  return (translated ? value.replace(key, () => translated) : value) as T;
}
export function ui(parts: TemplateStringsArray, ...values: unknown[]): string {
  const key = parts.reduce((text, part, i) => text + (i ? `{${i - 1}}` : '') + part, '');
  const translated = t(key);
  return translated.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ''));
}
/** Display-only Skill metadata, including captions saved by earlier versions. */
export function skillText(value: string | null | undefined): string {
  const text = value || '', translated = t(text);
  if (language !== 'en' || translated !== text) return translated;
  const verified = /^本机实测 · (.+)$/.exec(text);
  if (verified) return ui`本机实测 · ${verified[1]}`;
  const useCase = /^用途案例 (\d+)$/.exec(text);
  if (useCase) return ui`用途案例 ${useCase[1]}`;
  return text;
}
