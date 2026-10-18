import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { AnchorHTMLAttributes } from 'react';

const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
const routeKey = () => window.location.pathname + window.location.search;
const positions = new Map<string, number>();
const returnTargets = new Map<string, string>();
let activeRoute = routeKey();
let restoring = true;
window.history.scrollRestoration = 'manual';
window.addEventListener('scroll', () => {
  if (!restoring) positions.set(activeRoute, window.scrollY);
}, { passive: true });
window.addEventListener('popstate', () => {
  if (activeRoute !== routeKey()) restoring = true;
  activeRoute = routeKey();
});

/** Restore after React has mounted the destination, including async image data. */
export function useScrollRestoration(ready: boolean) {
  const { path, query } = useLocation();
  const key = path + (query.size ? '?' + query.toString() : '');
  useLayoutEffect(() => {
    if (!ready) return;
    activeRoute = routeKey(); restoring = true;
    const target = positions.get(activeRoute) || 0;
    let frame = 0, stopped = false, settledFrames = 0;
    const previousAnchor = document.documentElement.style.overflowAnchor;
    document.documentElement.style.overflowAnchor = 'none';
    const stop = () => {
      stopped = true; restoring = false; cancelAnimationFrame(frame);
      document.documentElement.style.overflowAnchor = previousAnchor;
      observer.disconnect(); clearTimeout(timeout);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('keydown', stop);
    };
    const restore = () => {
      if (stopped) return;
      window.scrollTo({ top: target, behavior: 'instant' });
      if (Math.abs(window.scrollY - target) < 1) {
        if (++settledFrames >= 2) stop();
        else frame = requestAnimationFrame(restore);
      } else settledFrames = 0;
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); });
    const timeout = window.setTimeout(stop, 5000);
    observer.observe(document.body);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('pointerdown', stop);
    window.addEventListener('keydown', stop);
    restore();
    return stop;
  }, [key, ready]);
}
export function useLocation() {
  const location = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
  const [path, search = ''] = location.split('?');
  return { path, query: new URLSearchParams(search) };
}
export function navigate(to: string, replace = false) {
  const from = routeKey();
  if (!restoring) positions.set(from, window.scrollY);
  // Detail pages retain the exact originating library URL (including search).
  if (/^\/skills\//.test(from) && to === '/skills') to = returnTargets.get(from) || to;
  if (to === from) return;
  if (window.location.pathname === '/skills' && /^\/skills\//.test(to)) returnTargets.set(to, from);
  activeRoute = to; restoring = true;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function Link({ href = '/', onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && !props.target) {
      event.preventDefault(); navigate(href);
    }
  }}>{children}</a>;
}
