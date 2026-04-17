import { query } from './db/database';
import { t } from './i18n';

/** Map a column/axis ID to LIKE patterns for attribute_name in web_product_sources */
export function columnToPatterns(colId: string): string[] {
  const map: Record<string, string[]> = {
    'price_anchor_usd': ['meta.street_price_usd', 'meta.msrp_usd'],
    'msrp_usd': ['meta.msrp_usd'],
    'release_year': ['meta.release_year', 'meta.release_date'],
    // sinad_db_spec は audiodb build 側で公称 THD+N(%) からの換算値も
    // 含むため、spec 側パターンには thd_n 系も含める。
    'sinad_db': ['%sinad%', '%thd_n_percent%'],
    'sinad_db_measured': ['%sinad%'],
    'sinad_db_spec': ['%sinad%', '%thd_n_percent%'],
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
    'fr_data': ['measure.fr.response', 'measure.fr.%'],
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
    // Extended attributes — design / form factor
    'is_closed_back': ['spec.design.is_closed_back'],
    'is_open_back': ['spec.design.is_open_back'],
    'is_semi_open': ['spec.design.is_semi_open'],
    'is_over_ear': ['spec.design.is_over_ear'],
    'is_on_ear': ['spec.design.is_on_ear'],
    'is_in_ear': ['spec.design.is_in_ear'],
    // Extended attributes — cable
    'cable_is_detachable': ['spec.cable.is_detachable'],
    'cable_plug_2_5mm': ['spec.cable.plug_2_5mm'],
    'cable_plug_3_5mm': ['spec.cable.plug_3_5mm'],
    'cable_plug_4_4mm': ['spec.cable.plug_4_4mm'],
    'cable_plug_6_35mm': ['spec.cable.plug_6_35mm'],
    'cable_length_m': ['spec.cable.length_m'],
    'cable_has_balanced_option': ['spec.cable.has_balanced_option'],
    'cable_socket_2pin': ['spec.cable.socket_2pin'],
    'cable_socket_mmcx': ['spec.cable.socket_mmcx'],
    'cable_socket_proprietary': ['spec.cable.socket_proprietary'],
    'cable_socket_mini_xlr': ['spec.cable.socket_mini_xlr'],
    // Extended attributes — wireless / bluetooth
    'has_wireless': ['spec.wireless.has_wireless'],
    'bluetooth_version': ['spec.bluetooth.version'],
    'wireless_multipoint': ['spec.wireless.multipoint'],
    'wireless_range_m': ['spec.wireless.range_m'],
    'wireless_codecs_json': ['spec.wireless.codecs%'],
    // Extended attributes — DAC / DSD
    'dac_chip_model': ['spec.dac.chip_model'],
    'dac_bit_depth': ['spec.dac.bit_depth'],
    'dac_sample_rate_max_khz': ['spec.dac.sample_rate_max_khz'],
    'dac_channels': ['spec.dac.channels'],
    'dsd_supported': ['spec.dsd.supported'],
    'dsd_max_level': ['spec.dsd.max_level'],
    'dsd_native': ['spec.dsd.native'],
    'dsd_64': ['spec.dsd.dsd_64'],
    'dsd_128': ['spec.dsd.dsd_128'],
    'dsd_256': ['spec.dsd.dsd_256'],
    'dsd_512': ['spec.dsd.dsd_512'],
    // Extended attributes — connectors
    'connectors_input_json': ['spec.connector.input%'],
    'connectors_output_json': ['spec.connector.output%'],
    'connector_count_input': ['spec.connector.input%'],
    'connector_count_output': ['spec.connector.output%'],
    // Extended attributes — battery
    'battery_life_hours': ['spec.battery.life_hours'],
    'battery_life_hours_anc_on': ['spec.battery.life_hours_anc_on'],
    'battery_total_life_hours': ['spec.battery.total_life_hours'],
    'battery_charge_time_hours': ['spec.battery.charge_time_hours'],
    'battery_quick_charge_min': ['spec.battery.quick_charge_min'],
    'battery_quick_charge_hours': ['spec.battery.quick_charge_hours'],
    'battery_wireless_charging': ['spec.battery.wireless_charging'],
    'battery_capacity_mah': ['spec.battery.capacity_mah'],
    // Extended attributes — dimensions
    'width_mm': ['spec.physical.width_mm'],
    'height_mm': ['spec.physical.height_mm'],
    'depth_mm': ['spec.physical.depth_mm'],
    // Extended attributes — features
    'has_anc': ['spec.feature.has_anc'],
    'has_transparency_mode': ['spec.feature.has_transparency_mode'],
    'has_spatial_audio': ['spec.feature.has_spatial_audio'],
    'has_head_tracking': ['spec.feature.has_head_tracking'],
    'has_app_eq': ['spec.feature.has_app_eq'],
    'has_voice_assistant': ['spec.feature.has_voice_assistant'],
    'is_foldable': ['spec.design.is_foldable'],
    'ip_rating': ['spec.feature.ip_rating'],
    'has_preamp_mode': ['spec.feature.has_preamp_mode'],
    'has_remote_control': ['spec.feature.has_remote_control'],
    'has_galvanic_isolation': ['spec.feature.has_galvanic_isolation'],
    // Extended attributes — driver / enclosure
    'driver_type': ['spec.driver.type'],
    'driver_sizes_mm': ['spec.physical.driver_size_mm', 'spec.driver.size_mm', 'spec.driver.diameter_mm'],
    'driver_diaphragm_material': ['spec.driver.diaphragm_material'],
    'driver_magnet_material': ['spec.driver.magnet_material'],
    'enclosure_is_vented': ['spec.enclosure.is_vented'],
    'enclosure_material': ['spec.enclosure.material'],
    // Extended attributes — power / amp
    'power_consumption_w': ['spec.power.consumption_w'],
    'power_is_universal_voltage': ['spec.power.is_universal_voltage'],
    'power_has_external_psu': ['spec.power.has_external_psu'],
    'power_has_usb_power': ['spec.power.has_usb_power'],
    'amp_has_balanced_output': ['spec.amp.has_balanced_output'],
    'amp_is_class_a': ['spec.amp.is_class_a'],
    'amp_is_class_ab': ['spec.amp.is_class_ab'],
    'amp_is_class_d': ['spec.amp.is_class_d'],
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
