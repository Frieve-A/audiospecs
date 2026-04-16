/**
 * Shared formatters and compact field definitions for Compare / Embed views.
 *
 * Compact fields aggregate multiple DB columns into a single display row
 * using tag badges, structured text, or composite numeric formatting.
 */

import { t } from './i18n';

/* ── Basic formatters (moved from compare.ts / embed-spec.ts) ── */

export function sig3(v: number): string {
  const n = parseFloat(v.toPrecision(3));
  if (n !== 0 && Math.abs(n) < 0.001) {
    const digits = -Math.floor(Math.log10(Math.abs(n))) + 2;
    return n.toFixed(digits).replace(/\.?0+$/, '');
  }
  return n.toString();
}

export function formatHz(v: number): string {
  if (v >= 1000) return parseFloat((v / 1000).toPrecision(3)).toString() + 'k';
  return sig3(v);
}

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format a number with sig3 precision + comma thousands separator for 4+ digit values. */
export function fmtNum(v: number): string {
  const s = sig3(v);
  const parts = s.split('.');
  if (parts[0].replace('-', '').length >= 4) {
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  return s;
}

/* ── Tag badge HTML ── */

export function tagBadges(tags: string[]): string {
  return tags.map((tag) => `<span class="attr-tag">${escHtml(tag)}</span>`).join(' ');
}

/* ── Connector JSON expansion ── */

const CONNECTOR_LABELS: Record<string, string> = {
  'usb_c': 'USB-C',
  'usb_b': 'USB-B',
  'usb_a': 'USB-A',
  'usb_micro': 'Micro USB',
  'optical': 'Optical',
  'coaxial': 'Coaxial',
  'bluetooth': 'Bluetooth',
  'rca': 'RCA',
  'xlr': 'XLR',
  'xlr_4pin': 'XLR 4-Pin',
  'mini_xlr': 'Mini XLR',
  'trs_6_35mm': '6.35mm',
  'trs_3_5mm': '3.5mm',
  'trs_2_5mm': '2.5mm',
  'pentaconn_4_4mm': '4.4mm',
  'speakon': 'Speakon',
  'banana': 'Banana',
  'binding_post': 'Binding Post',
  'hdmi': 'HDMI',
  'hdmi_earc': 'HDMI eARC',
  'aes_ebu': 'AES/EBU',
  'i2s': 'I2S',
  'ethernet': 'Ethernet',
  'wifi': 'Wi-Fi',
  'dc_barrel': 'DC',
  'iec_c14': 'IEC',
};

function connectorLabel(key: string): string {
  if (CONNECTOR_LABELS[key]) return CONNECTOR_LABELS[key];
  // Title-case fallback: "xlr_balanced" → "XLR Balanced"
  return key.replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function fmtConnectorJson(json: string | null): string {
  if (!json) return '—';
  try {
    const obj = JSON.parse(json) as Record<string, number>;
    return Object.entries(obj)
      .map(([k, v]) => `${connectorLabel(k)}${v > 1 ? ` \u00d7${v}` : ''}`)
      .join(', ');
  } catch {
    return '—';
  }
}

/* ── driver_type misclassification detection ── */

/** Patterns in driver_type that are actually amplifier circuit topologies. */
const AMP_TOPOLOGY_PATTERNS = [
  'tube', 'vacuum_tube', 'nfca', 'opa',
  'class_a', 'class_ab', 'class_d', 'class_h',
];

/** Patterns in driver_type that are actually DAC architectures. */
const DAC_ARCH_PATTERNS = ['r2r'];

function isAmpTopology(driverType: string): boolean {
  const lower = driverType.toLowerCase().replace(/[\s-]+/g, '_');
  return AMP_TOPOLOGY_PATTERNS.some((p) => lower.includes(p));
}

function isDacArchitecture(driverType: string): boolean {
  const lower = driverType.toLowerCase().replace(/[\s-]+/g, '_');
  return DAC_ARCH_PATTERNS.some((p) => lower.includes(p));
}

/** Returns true if driver_type is NOT an actual transducer/driver type. */
function isNotDriverType(driverType: string): boolean {
  return isAmpTopology(driverType) || isDacArchitecture(driverType);
}

/* ── Compact field type ── */

export interface CompactField {
  key: string;
  labelKey: string;
  type: 'compact';
  sourceKeys: string[];
  formatRow: (row: Record<string, unknown>) => string | null;
  section?: string;
}

/* ── Extended compact field definitions ── */

export function getExtendedCompactFields(): CompactField[] {
  return [
    // ▸ デザイン形態
    {
      key: 'ext_form_factor',
      labelKey: 'compare.field.form_factor',
      type: 'compact',
      sourceKeys: ['is_closed_back', 'is_open_back', 'is_semi_open', 'is_over_ear', 'is_on_ear', 'is_in_ear'],
      section: 'section.design',
      formatRow(row) {
        const tags: string[] = [];
        const bools: [unknown, string][] = [
          [row.is_closed_back, t('tag.closed_back')],
          [row.is_open_back, t('tag.open_back')],
          [row.is_semi_open, t('tag.semi_open')],
          [row.is_over_ear, t('tag.over_ear')],
          [row.is_on_ear, t('tag.on_ear')],
          [row.is_in_ear, t('tag.in_ear')],
        ];
        for (const [v, label] of bools) {
          if (v === 1) tags.push(label);
        }
        return tags.length ? tagBadges(tags) : '—';
      },
    },

    // ▸ ケーブル
    {
      key: 'ext_cable',
      labelKey: 'compare.field.cable',
      type: 'compact',
      sourceKeys: [
        'cable_is_detachable', 'cable_plug_mm', 'cable_length_m',
        'cable_has_balanced_option',
        'cable_socket_2pin', 'cable_socket_mmcx',
        'cable_socket_proprietary', 'cable_socket_mini_xlr',
      ],
      section: 'section.cable',
      formatRow(row) {
        const parts: string[] = [];
        if (row.cable_is_detachable === 1) parts.push(t('tag.detachable'));
        else if (row.cable_is_detachable === 0) parts.push(t('tag.fixed'));
        const sockets = ([
          [row.cable_socket_mmcx, 'MMCX'],
          [row.cable_socket_2pin, '2pin'],
          [row.cable_socket_mini_xlr, 'Mini XLR'],
          [row.cable_socket_proprietary, 'Proprietary'],
        ] as [unknown, string][]).filter(([v]) => v === 1).map(([, l]) => l);
        if (sockets.length) parts.push(sockets.join('/'));
        const specs: string[] = [];
        if (row.cable_plug_mm != null) specs.push(`${fmtNum(Number(row.cable_plug_mm))}mm`);
        if (row.cable_length_m != null) specs.push(`${fmtNum(Number(row.cable_length_m))}m`);
        if (specs.length) parts.push(specs.join(', '));
        if (row.cable_has_balanced_option === 1) parts.push('(Bal.)');
        return parts.join(' — ') || '—';
      },
    },

    // ▸ ワイヤレス / Bluetooth
    {
      key: 'ext_wireless',
      labelKey: 'compare.field.wireless',
      type: 'compact',
      sourceKeys: ['has_wireless', 'bluetooth_version', 'wireless_multipoint', 'wireless_range_m', 'wireless_codecs_json'],
      section: 'section.wireless',
      formatRow(row) {
        if (row.has_wireless === 0) return '—';
        const parts: string[] = [];
        if (row.bluetooth_version != null) parts.push(`BT ${fmtNum(Number(row.bluetooth_version))}`);
        if (row.wireless_codecs_json) {
          try {
            parts.push((JSON.parse(row.wireless_codecs_json as string) as string[]).join(', '));
          } catch { /* skip */ }
        }
        const extras: string[] = [];
        if (row.wireless_multipoint === 1) extras.push(t('tag.multipoint'));
        if (row.wireless_range_m != null) extras.push(`${fmtNum(Number(row.wireless_range_m))}m`);
        if (extras.length) parts.push(extras.join(', '));
        return parts.join(' — ') || '—';
      },
    },

    // ▸ DAC
    {
      key: 'ext_dac',
      labelKey: 'compare.field.dac',
      type: 'compact',
      sourceKeys: ['dac_chip_model', 'dac_bit_depth', 'dac_sample_rate_max_khz', 'dac_channels', 'driver_type'],
      section: 'section.dac_dsd',
      formatRow(row) {
        const parts: string[] = [];
        // driver_type 由来の DAC アーキテクチャ（例: R2R Ladder）
        if (row.driver_type && isDacArchitecture(String(row.driver_type))) {
          parts.push(capitalize(String(row.driver_type)));
        }
        if (row.dac_chip_model) parts.push(String(row.dac_chip_model));
        const specs: string[] = [];
        if (row.dac_bit_depth != null) specs.push(`${fmtNum(Number(row.dac_bit_depth))}-bit`);
        if (row.dac_sample_rate_max_khz != null) specs.push(`${fmtNum(Number(row.dac_sample_rate_max_khz))} kHz`);
        if (specs.length) parts.push(specs.join(' / '));
        if (row.dac_channels != null) parts.push(`${fmtNum(Number(row.dac_channels))}ch`);
        return parts.join(' — ') || null;
      },
    },

    // ▸ DSD
    {
      key: 'ext_dsd',
      labelKey: 'compare.field.dsd',
      type: 'compact',
      sourceKeys: ['dsd_supported', 'dsd_max_level', 'dsd_native', 'dsd_64', 'dsd_128', 'dsd_256', 'dsd_512'],
      formatRow(row) {
        if (row.dsd_supported === 0) return '—';
        if (!row.dsd_supported && !row.dsd_max_level) return null;
        const parts: string[] = [];
        if (row.dsd_max_level) parts.push(`DSD${row.dsd_max_level}`);
        else parts.push('DSD');
        if (row.dsd_native === 1) parts.push(`(${t('tag.native')})`);
        return parts.join(' ') || '—';
      },
    },

    // ▸ 入力端子
    {
      key: 'ext_inputs',
      labelKey: 'compare.field.inputs',
      type: 'compact',
      sourceKeys: ['connectors_input_json', 'connector_count_input'],
      section: 'section.connectors',
      formatRow(row) {
        const s = fmtConnectorJson(row.connectors_input_json as string | null);
        return s !== '—' ? s : null;
      },
    },

    // ▸ 出力端子
    {
      key: 'ext_outputs',
      labelKey: 'compare.field.outputs',
      type: 'compact',
      sourceKeys: ['connectors_output_json', 'connector_count_output'],
      formatRow(row) {
        const s = fmtConnectorJson(row.connectors_output_json as string | null);
        return s !== '—' ? s : null;
      },
    },

    // ▸ Battery Life (独立数値行 — compact wrapper for consistency)
    {
      key: 'ext_battery_life',
      labelKey: 'compare.field.battery_life',
      type: 'compact',
      sourceKeys: ['battery_life_hours'],
      section: 'section.battery',
      formatRow(row) {
        return row.battery_life_hours != null ? `${fmtNum(Number(row.battery_life_hours))} h` : null;
      },
    },

    // ▸ Battery Details
    {
      key: 'ext_battery_details',
      labelKey: 'compare.field.battery_details',
      type: 'compact',
      sourceKeys: [
        'battery_life_hours_anc_on', 'battery_total_life_hours',
        'battery_charge_time_hours', 'battery_quick_charge_min',
        'battery_quick_charge_hours', 'battery_wireless_charging',
        'battery_capacity_mah',
      ],
      formatRow(row) {
        const parts: string[] = [];
        const life: string[] = [];
        if (row.battery_life_hours_anc_on != null) life.push(`ANC: ${fmtNum(Number(row.battery_life_hours_anc_on))}h`);
        if (row.battery_total_life_hours != null) life.push(`Total: ${fmtNum(Number(row.battery_total_life_hours))}h`);
        if (life.length) parts.push(life.join(', '));
        const charge: string[] = [];
        if (row.battery_charge_time_hours != null) charge.push(`Charge: ${fmtNum(Number(row.battery_charge_time_hours))}h`);
        if (row.battery_quick_charge_min != null && row.battery_quick_charge_hours != null)
          charge.push(`Quick: ${fmtNum(Number(row.battery_quick_charge_min))}min\u2192${fmtNum(Number(row.battery_quick_charge_hours))}h`);
        if (charge.length) parts.push(charge.join(', '));
        const misc: string[] = [];
        if (row.battery_wireless_charging === 1) misc.push('Qi');
        if (row.battery_capacity_mah != null) misc.push(`${fmtNum(Number(row.battery_capacity_mah))}mAh`);
        if (misc.length) parts.push(misc.join(', '));
        return parts.join(' — ') || null;
      },
    },

    // ▸ 物理寸法
    {
      key: 'ext_size',
      labelKey: 'compare.field.size',
      type: 'compact',
      sourceKeys: ['width_mm', 'height_mm', 'depth_mm', 'driver_size_mm'],
      section: 'section.dimensions',
      formatRow(row) {
        const parts: string[] = [];
        const dims = [row.width_mm, row.height_mm, row.depth_mm];
        if (dims.some((d) => d != null)) {
          parts.push(dims.map((d) => d != null ? fmtNum(Number(d)) : '?').join(' \u00d7 ') + ' mm');
        }
        if (row.driver_size_mm != null) parts.push(`Driver: ${fmtNum(Number(row.driver_size_mm))}mm`);
        return parts.join(' — ') || null;
      },
    },

    // ▸ 機能
    {
      key: 'ext_features',
      labelKey: 'compare.field.features',
      type: 'compact',
      sourceKeys: [
        'has_anc', 'has_transparency_mode', 'has_spatial_audio',
        'has_head_tracking', 'has_app_eq', 'has_voice_assistant',
        'is_foldable', 'ip_rating',
        'has_preamp_mode', 'has_remote_control', 'has_galvanic_isolation',
      ],
      section: 'section.features',
      formatRow(row) {
        const tags: string[] = [];
        const boolFeatures: [unknown, string][] = [
          [row.has_anc, t('tag.anc')],
          [row.has_transparency_mode, t('tag.transparency')],
          [row.has_spatial_audio, t('tag.spatial_audio')],
          [row.has_head_tracking, t('tag.head_tracking')],
          [row.has_app_eq, t('tag.app_eq')],
          [row.has_voice_assistant, t('tag.voice_assistant')],
          [row.is_foldable, t('tag.foldable')],
          [row.has_preamp_mode, t('tag.preamp')],
          [row.has_remote_control, t('tag.remote')],
          [row.has_galvanic_isolation, t('tag.galvanic_iso')],
        ];
        for (const [v, label] of boolFeatures) {
          if (v === 1) tags.push(label);
        }
        if (row.ip_rating) tags.push(String(row.ip_rating));
        return tags.length ? tagBadges(tags) : '—';
      },
    },

    // ▸ ドライバー
    {
      key: 'ext_driver',
      labelKey: 'compare.field.driver',
      type: 'compact',
      sourceKeys: [
        'driver_type', 'driver_diameter_mm', 'driver_diaphragm_material',
        'driver_magnet_material',
      ],
      section: 'section.driver',
      formatRow(row) {
        const parts: string[] = [];
        const drv: string[] = [];
        // driver_type にアンプ回路方式やDACアーキテクチャが混入している場合はスキップ
        if (row.driver_type && !isNotDriverType(String(row.driver_type))) {
          drv.push(capitalize(String(row.driver_type)));
        }
        if (row.driver_diameter_mm != null) drv.push(`${fmtNum(Number(row.driver_diameter_mm))}mm`);
        if (drv.length) parts.push(drv.join(' '));
        const mats: string[] = [];
        if (row.driver_diaphragm_material) mats.push(String(row.driver_diaphragm_material));
        if (row.driver_magnet_material) mats.push(String(row.driver_magnet_material));
        if (mats.length) parts.push(mats.join(', '));
        return parts.join(' — ') || null;
      },
    },

    // ▸ 筐体
    {
      key: 'ext_enclosure',
      labelKey: 'compare.field.enclosure',
      type: 'compact',
      sourceKeys: ['enclosure_material', 'enclosure_is_vented'],
      formatRow(row) {
        const parts: string[] = [];
        if (row.enclosure_material) parts.push(String(row.enclosure_material));
        if (row.enclosure_is_vented === 1) parts.push(t('tag.vented'));
        return parts.join(' — ') || null;
      },
    },

    // ▸ アンプ方式
    // boolean フラグ + driver_type に混入したアンプ回路方式を統合表示
    {
      key: 'ext_amp_topology',
      labelKey: 'compare.field.amp_topology',
      type: 'compact',
      sourceKeys: [
        'amp_is_class_a', 'amp_is_class_ab', 'amp_is_class_d',
        'amp_has_balanced_output', 'driver_type',
      ],
      section: 'section.power',
      formatRow(row) {
        const tags: string[] = [];
        // driver_type 由来のアンプ方式
        if (row.driver_type && isAmpTopology(String(row.driver_type))) {
          tags.push(capitalize(String(row.driver_type)));
        }
        if (row.amp_is_class_a === 1) tags.push(t('tag.class_a'));
        if (row.amp_is_class_ab === 1) tags.push(t('tag.class_ab'));
        if (row.amp_is_class_d === 1) tags.push(t('tag.class_d'));
        if (row.amp_has_balanced_output === 1) tags.push(t('tag.balanced'));
        return tags.length ? tagBadges(tags) : null;
      },
    },

    // ▸ 電源
    {
      key: 'ext_power_supply',
      labelKey: 'compare.field.power_supply',
      type: 'compact',
      sourceKeys: [
        'power_is_universal_voltage', 'power_has_external_psu',
        'power_has_usb_power',
      ],
      formatRow(row) {
        const tags: string[] = [];
        if (row.power_has_usb_power === 1) tags.push(t('tag.usb_power'));
        if (row.power_has_external_psu === 1) tags.push(t('tag.external_psu'));
        if (row.power_is_universal_voltage === 1) tags.push(t('tag.universal_v'));
        return tags.length ? tagBadges(tags) : null;
      },
    },
  ];
}

/**
 * Collect all sourceKeys from compact fields into a flat, deduplicated list.
 * Used to ensure these columns are included in SELECT queries.
 */
export function getAllCompactSourceKeys(): string[] {
  const keys = new Set<string>();
  for (const f of getExtendedCompactFields()) {
    for (const k of f.sourceKeys) keys.add(k);
  }
  return [...keys];
}

/**
 * Check if a compact field should be visible for a given row.
 * Returns true if at least one sourceKey has a non-null value.
 */
export function isCompactFieldVisible(field: CompactField, row: Record<string, unknown>): boolean {
  return field.sourceKeys.some((k) => row[k] != null);
}
