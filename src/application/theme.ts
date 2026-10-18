export type Theme = 'light' | 'dark' | 'gold' | 'system';
export const themeStorageKey = 'skill-canvas-theme';
export function normalizeTheme(value: unknown): Theme { return value === 'system' || value === 'light' || value === 'gold' ? value : 'dark'; }
let stopSystem: (()=>void)|undefined;
export function applyTheme(theme: Theme) {
  stopSystem?.();stopSystem=undefined;
  const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: light)'):undefined;
  const render=()=>{const resolved=theme==='system'?(media?.matches?'light':'dark'):theme;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved==='light'?'light':'dark';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',resolved==='light'?'#fafafb':resolved==='gold'?'#242321':'#101112');};
  render();if(theme==='system'&&media){media.addEventListener('change',render);stopSystem=()=>media.removeEventListener('change',render);}
  try { localStorage.setItem(themeStorageKey, theme); } catch { /* IndexedDB / desktop settings remain authoritative. */ }
}
export function initializeTheme() {
  const initial=document.documentElement.dataset.theme;
  if(initial==='light'||initial==='dark'||initial==='gold'){applyTheme(initial);return;}
  try { applyTheme(normalizeTheme(localStorage.getItem(themeStorageKey))); } catch { applyTheme('dark'); }
}
