import { query } from './db/database';
import { t } from './i18n';

/** Map a column/axis ID to LIKE patterns for attribute_name in web_product_sources */
export function columnToPatterns(colId: string): string[] {
  const map: Record<string, string[]> = {
    'price_anchor_usd': ['meta.street_price_usd', 'meta.msrp_usd'],
    'msrp_usd': ['meta.msrp_usd'],
    'release_year': ['meta.release_year', 'meta.release_date'],
    'perf_sinad_db': ['%sinad%'],
    'perf_snr_db': ['%snr_dB%', '%snr_db%'],
    'perf_thd_percent': ['%thd_percent%', '%thd_n_percent%'],
    'perf_dynamic_range_db': ['%dynamic_range%'],
    'perf_crosstalk_db': ['%crosstalk%'],
    'spec_impedance_ohm': ['spec.audio.impedance_ohm', 'perf.impedance_ohm', 'measure.impedance_ohm'],
    'sensitivity_proxy_db': ['%sensitivity_dB_per_mW%', '%sensitivity_dB_per_V%'],
    'spec_weight_g': ['spec.physical.weight_g', 'measure.weight_g', 'perf.weight_g'],
    'driver_total_count': ['internal.driver.%_count'],
    'driveability_index': ['spec.audio.impedance_ohm', '%sensitivity_dB_per_mW%', '%sensitivity_dB_per_V%'],
    'spec_freq_low_hz': ['spec.audio.freq_low_hz'],
    'spec_freq_high_hz': ['spec.audio.freq_high_hz'],
    'crossover_freqs_hz_json': ['internal.crossover.freqs_hz'],
  };
  return map[colId] ?? [`%${colId.replace(/_/g, '%')}%`];
}

/** Query distinct source URLs for a product filtered by column patterns */
export async function fetchSourceUrls(
  productId: string,
  colIds: string[],
): Promise<string[]> {
  const patterns = [...new Set(colIds.flatMap(columnToPatterns))];
  const likeClauses = patterns.map(() => 'attribute_name LIKE ?').join(' OR ');
  type Row = { source_url: string };
  const rows = await query<Row>(
    `SELECT DISTINCT source_url FROM web_product_sources
     WHERE product_id = ? AND (${likeClauses})
     ORDER BY source_url`,
    [productId, ...patterns],
  );
  return rows.map((r) => r.source_url);
}

/** Query all distinct source URLs for a product (unfiltered) */
export async function fetchAllSourceUrls(productId: string): Promise<string[]> {
  type Row = { source_url: string };
  const rows = await query<Row>(
    `SELECT DISTINCT source_url FROM web_product_sources
     WHERE product_id = ?
     ORDER BY source_url`,
    [productId],
  );
  return rows.map((r) => r.source_url);
}

/** Dismiss any open source context menu */
export function dismissSourceMenu(): void {
  document.querySelector('.source-ctx-menu')?.remove();
}

/**
 * Show a context menu with source links at the given screen position.
 * Fetches sources asynchronously for the given product/columns.
 */
export function showSourceMenu(
  x: number,
  y: number,
  productId: string,
  colIds: string[],
): void {
  dismissSourceMenu();

  const menu = document.createElement('div');
  menu.className = 'source-ctx-menu';
  menu.innerHTML = `<div class="ctx-menu-label">${t('analysis.ctx.sources')}</div>
    <div class="ctx-menu-loading">…</div>`;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  // Adjust position to stay within viewport
  function reposition(): void {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
  }
  reposition();

  fetchSourceUrls(productId, colIds).then((urls) => {
    if (!document.body.contains(menu)) return;
    menu.querySelector('.ctx-menu-loading')?.remove();
    if (urls.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ctx-menu-empty';
      empty.textContent = '—';
      menu.appendChild(empty);
    } else {
      for (const url of urls) {
        const a = document.createElement('a');
        a.className = 'ctx-menu-source';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        try {
          a.textContent = new URL(url).hostname;
        } catch {
          a.textContent = url;
        }
        a.title = url;
        menu.appendChild(a);
      }
    }
    reposition();
  }).catch(() => {
    if (!document.body.contains(menu)) return;
    menu.querySelector('.ctx-menu-loading')?.remove();
  });
}

/** Set up global dismiss listeners (call once per view) */
export function setupSourceMenuDismiss(): void {
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.source-ctx-menu')) dismissSourceMenu();
  });
  document.addEventListener('touchstart', (e) => {
    if (!(e.target as HTMLElement).closest('.source-ctx-menu')) dismissSourceMenu();
  });
}
