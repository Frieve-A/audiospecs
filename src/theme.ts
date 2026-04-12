/* ── Theme utilities ── */

export type ThemeMode = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'audiospecs-theme';
const THEME_ICONS: Record<ThemeMode, string> = { auto: '🌓', light: '☀️', dark: '🌙' };
const THEME_ORDER: ThemeMode[] = ['auto', 'light', 'dark'];
let onChangeCallbacks: Array<() => void> = [];

export function getThemeMode(): ThemeMode {
  return (localStorage.getItem(THEME_KEY) as ThemeMode) || 'auto';
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode);
  document.querySelectorAll('.theme-toggle').forEach((el) => {
    el.textContent = THEME_ICONS[mode];
  });
}

export function initTheme(): void {
  applyTheme(getThemeMode());
}

export function cycleTheme(): void {
  const current = getThemeMode();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  onChangeCallbacks.forEach((cb) => cb());
}

/** Register a callback that fires after the theme changes. */
export function onThemeChange(cb: () => void): void {
  onChangeCallbacks.push(cb);
}

/** Returns true if the effective theme is dark (considering system preference for auto mode). */
export function isDarkTheme(): boolean {
  const mode = getThemeMode();
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  // auto — check system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Chart color palette that adapts to the current theme. */
export function chartColors() {
  const dark = isDarkTheme();
  return {
    paper_bgcolor: dark ? '#1e1e1e' : '#fff',
    plot_bgcolor: dark ? '#1e1e1e' : '#fff',
    gridcolor: dark ? '#333' : '#eee',
    zerolinecolor: dark ? '#444' : '#ddd',
    axisTitleColor: dark ? '#ccc' : '#374151',
    fontColor: dark ? '#ccc' : undefined,
    hoverlabelFontColor: '#fff',
    annotationColor: dark ? '#aaa' : '#555',
    annotationBg: dark ? 'rgba(30,30,30,0.8)' : 'rgba(255,255,255,0.8)',
    betterLabelColor: dark ? '#666' : '#9ca3af',
  };
}
