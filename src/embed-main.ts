/**
 * Entry point for the embeddable spec widget (embed.html).
 *
 * Parses URL hash parameters, initialises the database, and renders
 * the spec table. Completely independent of the main SPA.
 */

import './embed-style.css';
import { initDatabase } from './db/database';
import { initI18n, setLocale, t } from './i18n';
import { renderEmbedSpec } from './views/embed-spec';
import type { EmbedSpecParams } from './views/embed-spec';

function parseParams(): EmbedSpecParams | null {
  // Try hash first: embed.html#/spec?brand=X&product=Y
  // Also support: embed.html#brand=X&product=Y
  // Fallback to query string: embed.html?brand=X&product=Y
  let sp: URLSearchParams | null = null;

  const hash = window.location.hash;
  if (hash) {
    const qIdx = hash.indexOf('?');
    if (qIdx >= 0) {
      sp = new URLSearchParams(hash.slice(qIdx + 1));
    } else if (hash.includes('=')) {
      // No ? prefix — try parsing from after #
      sp = new URLSearchParams(hash.slice(1));
    }
  }

  // Fallback: query string
  if (!sp || (!sp.get('brand') && !sp.get('product'))) {
    sp = new URLSearchParams(window.location.search);
  }

  const brand = sp.get('brand');
  const product = sp.get('product');
  if (!brand || !product) return null;
  return {
    brand,
    product,
    lang: sp.get('lang') || undefined,
    theme: sp.get('theme') || undefined,
  };
}

async function main(): Promise<void> {
  const root = document.getElementById('embed-root')!;
  const params = parseParams();

  if (!params) {
    root.innerHTML = `<div class="embed-error"><div>Missing required parameters: brand, product</div></div>`;
    return;
  }

  // Apply theme
  const theme = params.theme || 'auto';
  document.documentElement.setAttribute('data-theme', theme);

  // Apply locale: URL param takes priority, otherwise detect from browser/localStorage
  initI18n();
  if (params.lang === 'ja' || params.lang === 'en') {
    setLocale(params.lang);
  }

  // Show loading
  root.innerHTML = `<div class="embed-loading"><div class="embed-spinner"></div><div>${t('common.loading_database')}</div></div>`;

  try {
    await initDatabase();
    root.innerHTML = '';
    await renderEmbedSpec(root, params);
  } catch (err) {
    console.error('Embed widget error:', err);
    root.innerHTML = `<div class="embed-error"><div>${t('common.error.db_load')}</div></div>`;
  }
}

main();
