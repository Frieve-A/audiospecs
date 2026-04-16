import { en } from './en';
import { ja } from './ja';

export type Locale = 'en' | 'ja';

const STORAGE_KEY = 'audiospecs-locale';

let currentLocale: Locale = 'en';
let onChangeCallbacks: Array<() => void> = [];

const translations: Record<Locale, Record<string, string>> = { en, ja };

/** Detect locale from browser settings */
function detectLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'ja') return saved;

  const lang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en';
  if (lang.startsWith('ja')) return 'ja';
  return 'en';
}

/** Initialize i18n — call once at startup */
export function initI18n(): void {
  currentLocale = detectLocale();
  document.documentElement.lang = currentLocale;
}

/** Get current locale */
export function getLocale(): Locale {
  return currentLocale;
}

/** Set locale and persist */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  document.title = t('page.title');
  for (const cb of onChangeCallbacks) cb();
}

/** Register a callback for locale changes */
export function onLocaleChange(cb: () => void): void {
  onChangeCallbacks.push(cb);
}

/** Get translated string. Supports {key} placeholders. */
export function t(key: string, params?: Record<string, string | number>): string {
  let str = translations[currentLocale]?.[key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

/** Get translated category label */
export function tCat(categoryKey: string): string {
  return t(`cat.${categoryKey}`) || categoryKey;
}

/** Get translated axis label */
export function tAxis(axisId: string): string {
  return t(`axis.${axisId}`);
}

/** Get translated axis description, or empty string if none defined. */
export function tAxisDesc(axisId: string): string {
  const key = `axisdesc.${axisId}`;
  const val = t(key);
  return val === key ? '' : val;
}

/** Get translated preset purpose */
export function tPreset(presetId: string): string {
  return t(`preset.${presetId}`);
}

/** Available locales for the UI selector */
export const AVAILABLE_LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];
