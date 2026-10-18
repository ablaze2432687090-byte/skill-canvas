// Runs before CSS/React: a saved light theme must not flash a dark canvas.
(() => {
  let theme = document.documentElement.dataset.theme;
  if (theme !== 'light' && theme !== 'dark' && theme !== 'gold') {
    try { theme = localStorage.getItem('skill-canvas-theme'); } catch {}
  }
  theme = theme === 'light' ? 'light' : theme === 'gold' ? 'gold' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
})();
