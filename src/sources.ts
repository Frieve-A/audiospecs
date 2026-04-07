import { query } from './db/database';
import { t } from './i18n';

/** Map a column/axis ID to LIKE patterns for attribute_name in web_product_sources */
export function columnToPatterns(colId: string): string[] {
  const map: Record<string, string[]> = {
    'price_anchor_usd': ['meta.street_price_usd', 'meta.msrp_usd'],
    'msrp_usd': ['meta.msrp_usd'],
    'release_year': ['meta.release_year', 'meta.release_date'],
    'sinad_db': ['%sinad%'],
    'snr_db': ['%snr_dB%', '%snr_db%'],
    'snr_db_measured': ['%snr_dB%', '%snr_db%'],
    'snr_db_spec': ['%snr_dB%', '%snr_db%'],
    'thd_percent': ['%thd_percent%', '%thd_n_percent%'],
    'thd_percent_measured': ['%thd_percent%', '%thd_n_percent%'],
    'thd_percent_spec': ['%thd_percent%', '%thd_n_percent%'],
    'dynamic_range_db': ['%dynamic_range%'],
    'dynamic_range_db_measured': ['%dynamic_range%'],
    'dynamic_range_db_spec': ['%dynamic_range%'],
    'crosstalk_db': ['%crosstalk%'],
    'crosstalk_db_measured': ['%crosstalk%'],
    'crosstalk_db_spec': ['%crosstalk%'],
    'impedance_ohm': ['spec.audio.impedance_ohm', 'perf.impedance_ohm', 'measure.impedance_ohm'],
    'impedance_ohm_measured': ['perf.impedance_ohm', 'measure.impedance_ohm'],
    'impedance_ohm_spec': ['spec.audio.impedance_ohm'],
    'sensitivity_db_per_mw': ['%sensitivity_dB_per_mW%'],
    'sensitivity_db_per_mw_measured': ['%sensitivity_dB_per_mW%'],
    'sensitivity_db_per_mw_spec': ['%sensitivity_dB_per_mW%'],
    'sensitivity_db_per_v': ['%sensitivity_dB_per_V%'],
    'sensitivity_db_per_v_measured': ['%sensitivity_dB_per_V%'],
    'sensitivity_db_per_v_spec': ['%sensitivity_dB_per_V%'],
    'sensitivity_proxy_db': ['%sensitivity_dB_per_mW%', '%sensitivity_dB_per_V%'],
    'weight_g': ['spec.physical.weight_g', 'measure.weight_g', 'perf.weight_g'],
    'driver_total_count': ['internal.driver.%_count'],
    'driveability_index': ['spec.audio.impedance_ohm', '%sensitivity_dB_per_mW%', '%sensitivity_dB_per_V%'],
    'freq_low_hz': ['%freq_low_hz%'],
    'freq_low_hz_measured': ['%freq_low_hz%'],
    'freq_low_hz_spec': ['spec.audio.freq_low_hz'],
    'freq_high_hz': ['%freq_high_hz%'],
    'freq_high_hz_measured': ['%freq_high_hz%'],
    'freq_high_hz_spec': ['spec.audio.freq_high_hz'],
    'crossover_freqs_hz_json': ['internal.crossover.freqs_hz'],
    'amp_power_mw_32ohm': ['%power_mw_32ohm%', '%power_mw%'],
    'amp_power_mw_32ohm_measured': ['%power_mw_32ohm%', '%power_mw%'],
    'amp_power_mw_32ohm_spec': ['%power_mw_32ohm%', '%power_mw%'],
    'amp_power_w': ['%power_w%'],
    'amp_power_w_measured': ['%power_w%'],
    'amp_power_w_spec': ['%power_w%'],
    'amp_voltage_vrms': ['%voltage_vrms%'],
    'amp_voltage_vrms_measured': ['%voltage_vrms%'],
    'amp_voltage_vrms_spec': ['%voltage_vrms%'],
    'amp_voltage_vrms_balanced': ['%voltage_vrms_balanced%'],
    'amp_voltage_vrms_balanced_measured': ['%voltage_vrms_balanced%'],
    'amp_voltage_vrms_balanced_spec': ['%voltage_vrms_balanced%'],
    'amp_output_impedance_ohm': ['%output_impedance%'],
    'amp_output_impedance_ohm_measured': ['%output_impedance%'],
    'amp_output_impedance_ohm_spec': ['%output_impedance%'],
    'line_output_impedance_ohm': ['%line_output_impedance%', '%output_impedance%'],
    'line_output_impedance_ohm_measured': ['%line_output_impedance%', '%output_impedance%'],
    'line_output_impedance_ohm_spec': ['%line_output_impedance%', '%output_impedance%'],
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
