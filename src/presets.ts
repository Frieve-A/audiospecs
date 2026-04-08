import { t, tAxis, tCat, tPreset } from './i18n';

export interface AxisDef {
  id: string;
  source: string;
  /** Use getAxisLabel() for display; this is the English fallback */
  label: string;
  scale: 'log' | 'linear' | 'year';
  /** Which direction is "better" for this metric, or undefined if neutral/context-dependent */
  better?: 'higher' | 'lower';
}

/** Minimum number of non-null data points required to show an axis in the dropdown */
export const AXIS_MIN_POINTS = 10;

export interface Preset {
  id: string;
  x: string;
  y: string;
  color: string;
  categories: string[];
  /** Use getPresetPurpose() for display; this is the English fallback */
  purpose: string;
}

export const AXES: AxisDef[] = [
  // Price / time
  { id: 'price_anchor_usd', source: "coalesce(street_price_usd, msrp_usd)", label: 'Price (USD)', scale: 'log', better: 'lower' },
  { id: 'msrp_usd', source: 'msrp_usd', label: 'MSRP', scale: 'log', better: 'lower' },
  { id: 'release_year', source: 'release_year', label: 'Release Year', scale: 'year', better: 'higher' },
  // Perf
  { id: 'sinad_db', source: 'sinad_db', label: 'SINAD (dB)', scale: 'linear', better: 'higher' },
  { id: 'sinad_db_measured', source: 'sinad_db_measured', label: 'SINAD measured (dB)', scale: 'linear', better: 'higher' },
  { id: 'sinad_db_spec', source: 'sinad_db_spec', label: 'SINAD spec (dB)', scale: 'linear', better: 'higher' },
  { id: 'snr_db', source: 'snr_db', label: 'SNR (dB)', scale: 'linear', better: 'higher' },
  { id: 'snr_db_measured', source: 'snr_db_measured', label: 'SNR measured (dB)', scale: 'linear', better: 'higher' },
  { id: 'snr_db_spec', source: 'snr_db_spec', label: 'SNR spec (dB)', scale: 'linear', better: 'higher' },
  { id: 'thd_percent', source: 'thd_percent', label: 'THD (%)', scale: 'log', better: 'lower' },
  { id: 'thd_percent_measured', source: 'thd_percent_measured', label: 'THD measured (%)', scale: 'log', better: 'lower' },
  { id: 'thd_percent_spec', source: 'thd_percent_spec', label: 'THD spec (%)', scale: 'log', better: 'lower' },
  { id: 'dynamic_range_db', source: 'dynamic_range_db', label: 'Dynamic Range (dB)', scale: 'linear', better: 'higher' },
  { id: 'dynamic_range_db_measured', source: 'dynamic_range_db_measured', label: 'Dynamic Range measured (dB)', scale: 'linear', better: 'higher' },
  { id: 'dynamic_range_db_spec', source: 'dynamic_range_db_spec', label: 'Dynamic Range spec (dB)', scale: 'linear', better: 'higher' },
  { id: 'crosstalk_db', source: 'crosstalk_db', label: 'Crosstalk (dB)', scale: 'linear', better: 'lower' },
  { id: 'crosstalk_db_measured', source: 'crosstalk_db_measured', label: 'Crosstalk measured (dB)', scale: 'linear', better: 'lower' },
  { id: 'crosstalk_db_spec', source: 'crosstalk_db_spec', label: 'Crosstalk spec (dB)', scale: 'linear', better: 'lower' },
  // Spec / Driveability
  { id: 'impedance_ohm', source: 'impedance_ohm', label: 'Impedance (Ω)', scale: 'log' },
  { id: 'impedance_ohm_measured', source: 'impedance_ohm_measured', label: 'Impedance measured (Ω)', scale: 'log' },
  { id: 'impedance_ohm_spec', source: 'impedance_ohm_spec', label: 'Impedance spec (Ω)', scale: 'log' },
  { id: 'sensitivity_db_per_mw', source: 'sensitivity_db_per_mw', label: 'Sensitivity (dB/mW)', scale: 'linear', better: 'higher' },
  { id: 'sensitivity_db_per_mw_measured', source: 'sensitivity_db_per_mw_measured', label: 'Sensitivity measured (dB/mW)', scale: 'linear', better: 'higher' },
  { id: 'sensitivity_db_per_mw_spec', source: 'sensitivity_db_per_mw_spec', label: 'Sensitivity spec (dB/mW)', scale: 'linear', better: 'higher' },
  { id: 'sensitivity_db_per_v', source: 'sensitivity_db_per_v', label: 'Sensitivity (dB/V)', scale: 'linear', better: 'higher' },
  { id: 'sensitivity_db_per_v_measured', source: 'sensitivity_db_per_v_measured', label: 'Sensitivity measured (dB/V)', scale: 'linear', better: 'higher' },
  { id: 'sensitivity_db_per_v_spec', source: 'sensitivity_db_per_v_spec', label: 'Sensitivity spec (dB/V)', scale: 'linear', better: 'higher' },
  { id: 'sensitivity_proxy_db', source: 'sensitivity_proxy_db', label: 'Sensitivity Proxy (dB)', scale: 'linear', better: 'higher' },
  { id: 'driveability_index', source: 'driveability_index', label: 'Driveability', scale: 'linear', better: 'higher' },
  { id: 'weight_g', source: 'weight_g', label: 'Weight (g)', scale: 'log', better: 'lower' },
  { id: 'driver_total_count', source: 'driver_total_count', label: 'Driver Count', scale: 'linear' },
  { id: 'freq_low_hz', source: 'freq_low_hz', label: 'Freq Low (Hz)', scale: 'log', better: 'lower' },
  { id: 'freq_low_hz_measured', source: 'freq_low_hz_measured', label: 'Freq Low measured (Hz)', scale: 'log', better: 'lower' },
  { id: 'freq_low_hz_spec', source: 'freq_low_hz_spec', label: 'Freq Low spec (Hz)', scale: 'log', better: 'lower' },
  { id: 'freq_high_hz', source: 'freq_high_hz', label: 'Freq High (Hz)', scale: 'log', better: 'higher' },
  { id: 'freq_high_hz_measured', source: 'freq_high_hz_measured', label: 'Freq High measured (Hz)', scale: 'log', better: 'higher' },
  { id: 'freq_high_hz_spec', source: 'freq_high_hz_spec', label: 'Freq High spec (Hz)', scale: 'log', better: 'higher' },
  // FR Harman (Headphone / IEM)
  { id: 'fr_harman_std_db', source: 'fr_harman_std_db', label: 'FR Harman Std Dev (dB)', scale: 'linear', better: 'lower' },
  { id: 'fr_harman_avg_db', source: 'fr_harman_avg_db', label: 'FR Harman Avg Dev (dB)', scale: 'linear', better: 'lower' },
  // Spinorama Preference Score (Speaker)
  { id: 'preference_score', source: 'preference_score', label: 'Preference Score', scale: 'linear', better: 'higher' },
  { id: 'preference_score_with_sub', source: 'preference_score_with_sub', label: 'Pref Score (w/ Sub)', scale: 'linear', better: 'higher' },
  { id: 'preference_score_eq', source: 'preference_score_eq', label: 'Pref Score (EQ)', scale: 'linear', better: 'higher' },
  { id: 'preference_score_eq_with_sub', source: 'preference_score_eq_with_sub', label: 'Pref Score (EQ + Sub)', scale: 'linear', better: 'higher' },
  // Amp output
  { id: 'amp_power_mw_32ohm', source: 'amp_power_mw_32ohm', label: 'Headphone Output Power (mW @ 32Ω)', scale: 'log', better: 'higher' },
  { id: 'amp_power_mw_32ohm_measured', source: 'amp_power_mw_32ohm_measured', label: 'Headphone Output Power measured (mW @ 32Ω)', scale: 'log', better: 'higher' },
  { id: 'amp_power_mw_32ohm_spec', source: 'amp_power_mw_32ohm_spec', label: 'Headphone Output Power spec (mW @ 32Ω)', scale: 'log', better: 'higher' },
  { id: 'amp_power_w', source: 'amp_power_w', label: 'Speaker Output Power (W)', scale: 'log', better: 'higher' },
  { id: 'amp_power_w_measured', source: 'amp_power_w_measured', label: 'Speaker Output Power measured (W)', scale: 'log', better: 'higher' },
  { id: 'amp_power_w_spec', source: 'amp_power_w_spec', label: 'Speaker Output Power spec (W)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms', source: 'amp_voltage_vrms', label: 'Output Voltage SE (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms_measured', source: 'amp_voltage_vrms_measured', label: 'Output Voltage SE measured (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms_spec', source: 'amp_voltage_vrms_spec', label: 'Output Voltage SE spec (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms_balanced', source: 'amp_voltage_vrms_balanced', label: 'Output Voltage BAL (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms_balanced_measured', source: 'amp_voltage_vrms_balanced_measured', label: 'Output Voltage BAL measured (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms_balanced_spec', source: 'amp_voltage_vrms_balanced_spec', label: 'Output Voltage BAL spec (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_output_impedance_ohm', source: 'amp_output_impedance_ohm', label: 'HP Output Impedance (Ω)', scale: 'log', better: 'lower' },
  { id: 'amp_output_impedance_ohm_measured', source: 'amp_output_impedance_ohm_measured', label: 'HP Output Impedance measured (Ω)', scale: 'log', better: 'lower' },
  { id: 'amp_output_impedance_ohm_spec', source: 'amp_output_impedance_ohm_spec', label: 'HP Output Impedance spec (Ω)', scale: 'log', better: 'lower' },
  { id: 'line_output_impedance_ohm', source: 'line_output_impedance_ohm', label: 'Line Output Impedance (Ω)', scale: 'log', better: 'lower' },
  { id: 'line_output_impedance_ohm_measured', source: 'line_output_impedance_ohm_measured', label: 'Line Output Impedance measured (Ω)', scale: 'log', better: 'lower' },
  { id: 'line_output_impedance_ohm_spec', source: 'line_output_impedance_ohm_spec', label: 'Line Output Impedance spec (Ω)', scale: 'log', better: 'lower' },
];

export const PRESETS: Preset[] = [
  // DAC / amp
  { id: 'msrp_vs_sinad', x: 'price_anchor_usd', y: 'sinad_db', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs measured quality' },
  { id: 'msrp_vs_thd', x: 'price_anchor_usd', y: 'thd_percent', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs distortion' },
  { id: 'thd_vs_sinad', x: 'thd_percent', y: 'sinad_db', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Correlation between perf metrics' },
  { id: 'release_vs_sinad', x: 'release_year', y: 'sinad_db', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Technology evolution' },
  // Headphone / IEM
  { id: 'impedance_vs_sensitivity', x: 'impedance_ohm', y: 'sensitivity_proxy_db', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Driveability overview' },
  { id: 'msrp_vs_driveability', x: 'price_anchor_usd', y: 'driveability_index', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs driveability' },
  { id: 'release_vs_driveability', x: 'release_year', y: 'driveability_index', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Era vs driveability' },
  { id: 'msrp_vs_weight', x: 'price_anchor_usd', y: 'weight_g', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs physical weight' },
  // FR Harman
  { id: 'msrp_vs_harman_std', x: 'price_anchor_usd', y: 'fr_harman_std_db', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs FR Harman deviation' },
  { id: 'msrp_vs_harman_avg', x: 'price_anchor_usd', y: 'fr_harman_avg_db', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs FR Harman avg deviation' },
  // Frequency range
  { id: 'msrp_vs_freq_range', x: 'freq_low_hz', y: 'freq_high_hz', color: 'brand_name_en', categories: ['headphone', 'iem', 'speaker'], purpose: 'Frequency range overview' },
  // Amp output
  { id: 'msrp_vs_power_32ohm', x: 'price_anchor_usd', y: 'amp_power_mw_32ohm', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs headphone output power' },
  { id: 'msrp_vs_output_impedance', x: 'price_anchor_usd', y: 'amp_output_impedance_ohm', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs HP output impedance' },
  { id: 'msrp_vs_line_output_impedance', x: 'price_anchor_usd', y: 'line_output_impedance_ohm', color: 'brand_name_en', categories: ['dac'], purpose: 'Price vs line output impedance' },
  { id: 'msrp_vs_speaker_power', x: 'price_anchor_usd', y: 'amp_power_w', color: 'brand_name_en', categories: ['speaker', 'speaker_amp'], purpose: 'Price vs speaker output power' },
  // Speaker — Spinorama Preference Score
  { id: 'msrp_vs_preference', x: 'price_anchor_usd', y: 'preference_score', color: 'brand_name_en', categories: ['speaker'], purpose: 'Price vs Spinorama preference' },
  { id: 'msrp_vs_preference_sub', x: 'price_anchor_usd', y: 'preference_score_with_sub', color: 'brand_name_en', categories: ['speaker'], purpose: 'Price vs Spinorama preference (w/ sub)' },
  { id: 'preference_vs_preference_eq', x: 'preference_score', y: 'preference_score_eq', color: 'brand_name_en', categories: ['speaker'], purpose: 'EQ improvement on preference score' },
];

/** Get localized axis label (falls back to axis.label if no i18n entry) */
export function getAxisLabel(axis: AxisDef): string {
  const key = `axis.${axis.id}`;
  const translated = tAxis(axis.id);
  return translated === key ? axis.label : translated;
}

/** Get localized preset purpose */
export function getPresetPurpose(preset: Preset): string {
  return tPreset(preset.id);
}

/** Get localized category label */
export function getCategoryLabel(key: string): string {
  return tCat(key);
}

export function getAxis(id: string): AxisDef | undefined {
  return AXES.find((a) => a.id === id);
}

export type DataSource = 'best' | 'both' | 'spec' | 'measured';
/** X axis cannot use 'both' (only Y axis can, to avoid ambiguous 2×2 expansion). */
export type XDataSource = 'best' | 'spec' | 'measured';
export type YDataSource = DataSource;

/** Data-source options available for the given axis, depending on X vs Y and axis kind. */
export function validDataSourcesForAxis(baseId: string, isY: boolean): DataSource[] {
  const kind = getAxisSourceKind(baseId);
  if (kind === 'multi') {
    return isY ? ['best', 'both', 'spec', 'measured'] : ['best', 'spec', 'measured'];
  }
  if (kind === 'measured') return ['best', 'measured'];
  if (kind === 'spec') return ['best', 'spec'];
  // meta: source setting is meaningless — expose only 'best'.
  return ['best'];
}

/** Classification of an axis's data origin. */
export type AxisSourceKind = 'meta' | 'multi' | 'measured' | 'spec';

/**
 * Axes that are always measured (no `_spec` counterpart, and the value
 * intrinsically originates from third-party measurement).
 */
const FIXED_MEASURED_AXES = new Set<string>([
  'sensitivity_proxy_db',
  'driveability_index',
  'fr_harman_std_db',
  'fr_harman_avg_db',
  'preference_score',
  'preference_score_with_sub',
  'preference_score_eq',
  'preference_score_eq_with_sub',
]);

/**
 * Axes that are always manufacturer-declared (no `_measured` counterpart).
 */
const FIXED_SPEC_AXES = new Set<string>([
  'weight_g',
  'driver_total_count',
]);

/** True if the given base axis has both `_measured` and `_spec` sibling variants in AXES. */
export function axisHasSourceVariants(baseId: string): boolean {
  return !!getAxis(`${baseId}_measured`) && !!getAxis(`${baseId}_spec`);
}

/** Classify an axis by its data-source origin. */
export function getAxisSourceKind(baseId: string): AxisSourceKind {
  if (axisHasSourceVariants(baseId)) return 'multi';
  if (FIXED_MEASURED_AXES.has(baseId)) return 'measured';
  if (FIXED_SPEC_AXES.has(baseId)) return 'spec';
  return 'meta';
}

/** Whether a base axis is usable under the given data-source setting. */
export function axisMatchesDataSource(baseId: string, ds: DataSource): boolean {
  const kind = getAxisSourceKind(baseId);
  if (ds === 'best' || ds === 'both') return true;
  if (kind === 'meta' || kind === 'multi') return true;
  return kind === ds;
}

/**
 * Resolve the SQL source expression for a base axis id given a data-source choice.
 * - 'best': use the base axis's own source expression (best-available column).
 * - 'measured' / 'spec': use the corresponding variant column if variants exist.
 *   For non-variant axes, returns the base expression if its fixed kind matches
 *   the chosen data source (or is meta), otherwise returns 'NULL' so the row is
 *   filtered out by the NOT NULL check.
 * - 'both': caller should handle UNION across spec/measured; this returns the base expression as a fallback.
 */
export function resolveAxisSource(baseId: string, ds: DataSource): string {
  const base = getAxis(baseId);
  const baseExpr = base?.source || baseId;
  if (ds === 'best' || ds === 'both') return baseExpr;
  if (axisHasSourceVariants(baseId)) {
    const variantId = `${baseId}_${ds}`;
    const variant = getAxis(variantId);
    return variant?.source || baseExpr;
  }
  const kind = getAxisSourceKind(baseId);
  if (kind === 'meta' || kind === ds) return baseExpr;
  return 'NULL';
}

/** Axis ids that are variant (measured/spec) — excluded from the Analysis dropdown. */
export function isVariantAxisId(id: string): boolean {
  return /_(measured|spec)$/.test(id);
}

/** Axes whose 0 values should be clamped to a floor for log-scale display */
const LOG_CLAMP_AXES: Record<string, number> = {
  amp_output_impedance_ohm: 0.01,
  amp_output_impedance_ohm_measured: 0.01,
  amp_output_impedance_ohm_spec: 0.01,
  line_output_impedance_ohm: 0.01,
  line_output_impedance_ohm_measured: 0.01,
  line_output_impedance_ohm_spec: 0.01,
};

/**
 * Clamp 0 values to a display floor for specific log-scale axes.
 * Plot coordinates use clamped x_val / y_val; original values are preserved
 * in x_val_raw / y_val_raw for hover display.
 */
export function clampForScatter<T extends { x_val: number; y_val: number }>(
  rows: T[], xAxisId: string, yAxisId: string,
): (T & { x_val_raw: number; y_val_raw: number })[] {
  const xFloor = LOG_CLAMP_AXES[xAxisId];
  const yFloor = LOG_CLAMP_AXES[yAxisId];
  return rows.map((r) => ({
    ...r,
    x_val_raw: r.x_val,
    y_val_raw: r.y_val,
    x_val: xFloor != null && r.x_val <= 0 ? xFloor : r.x_val,
    y_val: yFloor != null && r.y_val <= 0 ? yFloor : r.y_val,
  }));
}


/**
 * Return axes that have at least AXIS_MIN_POINTS non-null data points
 * across the given categories. Requires a query function to check the DB.
 */
export async function getAxesForCategories(
  cats: string[],
  queryFn: <T>(sql: string, params?: unknown[]) => Promise<T[]>,
): Promise<AxisDef[]> {
  const catPlaceholders = cats.map(() => '?').join(',');
  const countExprs = AXES.map(
    (a) => `SUM(CASE WHEN ${a.source} IS NOT NULL THEN 1 ELSE 0 END) as "${a.id}"`,
  ).join(',\n    ');

  const sql = `
    SELECT ${countExprs}
    FROM web_product_core
    WHERE category_primary IN (${catPlaceholders})
  `;
  const rows = await queryFn<Record<string, number>>(sql, cats);
  if (!rows.length) return [];

  const counts = rows[0];
  return AXES.filter((a) => (counts[a.id] ?? 0) >= AXIS_MIN_POINTS);
}

/** Axis IDs that are universal (price/time) — not "performance" metrics */
const UNIVERSAL_AXIS_IDS = new Set(['price_anchor_usd', 'msrp_usd', 'release_year']);

/** Performance/spec axes only (excludes price & time) */
const METRIC_AXES = AXES.filter((a) => !UNIVERSAL_AXIS_IDS.has(a.id));

/** All category keys */
export const CATEGORY_KEYS = [
  'headphone', 'iem', 'dac', 'headphone_amp',
  'speaker', 'speaker_amp', 'mic', 'usb_interface',
];

/**
 * Return categories that have at least one performance/spec axis
 * with >= AXIS_MIN_POINTS non-null data points.
 */
export async function getValidCategories(
  queryFn: <T>(sql: string, params?: unknown[]) => Promise<T[]>,
): Promise<string[]> {
  const countExprs = METRIC_AXES.map(
    (a) => `SUM(CASE WHEN ${a.source} IS NOT NULL THEN 1 ELSE 0 END) as "${a.id}"`,
  ).join(',\n    ');

  const sql = `
    SELECT category_primary, ${countExprs}
    FROM web_product_core
    GROUP BY category_primary
  `;
  const rows = await queryFn<Record<string, unknown>>(sql);

  const valid: string[] = [];
  for (const row of rows) {
    const cat = row.category_primary as string;
    if (!CATEGORY_KEYS.includes(cat)) continue;
    const hasMetric = METRIC_AXES.some(
      (a) => ((row[a.id] as number) ?? 0) >= AXIS_MIN_POINTS,
    );
    if (hasMetric) valid.push(cat);
  }

  // Preserve display order
  return CATEGORY_KEYS.filter((c) => valid.includes(c));
}

/**
 * Get the scale type for a given field key.
 * Returns 'log' | 'linear' | 'year' based on AXES definition.
 */
export function getScaleForField(key: string): 'log' | 'linear' | 'year' {
  const axis = AXES.find((a) => a.id === key);
  return axis?.scale ?? 'linear';
}

/**
 * Compute bar width percentage (0–100) for a value within a min/max range,
 * respecting the field's scale type (log or linear).
 */
export function computeBarPercent(value: number, min: number, max: number, scale: 'log' | 'linear' | 'year'): number {
  if (min === max) return 50;
  if (scale === 'log') {
    // For log scale, both min and max must be positive
    const safeMin = Math.max(min, 1e-10);
    const safeMax = Math.max(max, 1e-10);
    const safeVal = Math.max(value, 1e-10);
    const logMin = Math.log(safeMin);
    const logMax = Math.log(safeMax);
    if (logMin === logMax) return 50;
    return Math.max(0, Math.min(100, ((Math.log(safeVal) - logMin) / (logMax - logMin)) * 100));
  }
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function getPresetsForCategories(cats: string[]): Preset[] {
  return PRESETS.filter((p) =>
    p.categories.includes('all') || p.categories.some((c) => cats.includes(c)),
  );
}

/**
 * @deprecated Use getCategoryLabel() instead for i18n support.
 * Kept for backward compatibility during transition.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  headphone: 'Headphone',
  iem: 'IEM',
  dac: 'DAC',
  headphone_amp: 'Headphone Amp',
  speaker: 'Speaker',
  speaker_amp: 'Speaker Amp',
  mic: 'Microphone',
  usb_interface: 'USB Interface',
};

/**
 * Build Plotly annotations showing "Better →" / "← Better" at the axis edges.
 * Placed just inside the plot area boundary to avoid overlapping tick labels.
 * For y-axis, text is rotated -90° so ← visually points up and → points down.
 */
export function buildBetterAnnotations(
  xAxis: AxisDef,
  yAxis: AxisDef,
  fontScale: number,
): Array<Record<string, unknown>> {
  const label = t('common.better');
  const font = { size: 11 * fontScale, color: '#9ca3af', family: 'Inter, sans-serif' };
  const annotations: Array<Record<string, unknown>> = [];

  if (xAxis.better) {
    const isRight = xAxis.better === 'higher';
    annotations.push({
      xref: 'paper',
      yref: 'paper',
      x: isRight ? 0.99 : 0.025,
      y: 0.005,
      xanchor: isRight ? 'right' : 'left',
      yanchor: 'bottom',
      showarrow: false,
      text: isRight ? `${label} →` : `← ${label}`,
      font,
    });
  }

  if (yAxis.better) {
    const isUp = yAxis.better === 'higher';
    annotations.push({
      xref: 'paper',
      yref: 'paper',
      x: 0.005,
      y: isUp ? 0.99 : 0.05,
      xanchor: 'left',
      yanchor: isUp ? 'top' : 'bottom',
      showarrow: false,
      // Rotated -90°: → visually points up, ← visually points down
      text: isUp ? `${label} →` : `← ${label}`,
      font,
      textangle: -90,
    });
  }

  return annotations;
}

/**
 * Compute Pareto-optimal frontier points from scatter data.
 * Only applicable when both axes have a defined `better` direction.
 * Returns sorted {x, y} pairs for drawing the frontier line, or null if not applicable.
 */
export function computeParetoFrontier(
  rows: Array<{ x_val: number; y_val: number }>,
  xAxis: AxisDef,
  yAxis: AxisDef,
): Array<{ x: number; y: number }> | null {
  if (!xAxis.better || !yAxis.better || rows.length < 2) return null;

  // Convert to maximisation: negate if "lower is better"
  const xSign = xAxis.better === 'higher' ? 1 : -1;
  const ySign = yAxis.better === 'higher' ? 1 : -1;

  // Build converted points
  const pts = rows.map((r) => ({
    ox: r.x_val,
    oy: r.y_val,
    cx: r.x_val * xSign,
    cy: r.y_val * ySign,
  }));

  // Sort by converted x descending, then converted y descending
  pts.sort((a, b) => b.cx - a.cx || b.cy - a.cy);

  // Sweep: keep points whose converted y is a new maximum
  const frontier: Array<{ x: number; y: number }> = [];
  let maxCy = -Infinity;
  for (const p of pts) {
    if (p.cy > maxCy) {
      frontier.push({ x: p.ox, y: p.oy });
      maxCy = p.cy;
    }
  }

  if (frontier.length === 0) return null;

  // Sort by original x for drawing
  frontier.sort((a, b) => a.x - b.x);

  // Expand to staircase with corners that always dent toward the non-better
  // (worse) side, so the boundary clearly shows the Pareto-optimal region.
  const xBetterLower = xAxis.better === 'lower';
  const steps: Array<{ x: number; y: number }> = [frontier[0]];
  for (let i = 1; i < frontier.length; i++) {
    const prev = frontier[i - 1];
    const cur = frontier[i];
    if (xBetterLower) {
      // Corner at (cur.x, prev.y): dents toward higher-x / lower-y (worse side)
      steps.push({ x: cur.x, y: prev.y });
    } else {
      // Corner at (prev.x, cur.y): dents toward lower-x / lower-y (worse side)
      steps.push({ x: prev.x, y: cur.y });
    }
    steps.push(cur);
  }

  // Extend the staircase to graph edges in the WORSE (non-better) direction,
  // so the full boundary of "cross this → Pareto updates" is visible.
  function edgeValue(vals: number[], _scale: 'log' | 'linear' | 'year', toward: 'min' | 'max'): number {
    // Use actual data min/max so the Pareto line does not push Plotly's
    // autorange beyond the real data extent.
    return toward === 'min' ? Math.min(...vals) : Math.max(...vals);
  }

  const allX = rows.map((r) => r.x_val);
  const allY = rows.map((r) => r.y_val);
  // Worse edge = opposite of better
  const xWorseEdge = edgeValue(allX, xAxis.scale, xAxis.better === 'lower' ? 'max' : 'min');
  const yWorseEdge = edgeValue(allY, yAxis.scale, yAxis.better === 'lower' ? 'max' : 'min');

  const first = frontier[0];
  const last = frontier[frontier.length - 1];

  if (xBetterLower) {
    // first has best X (lowest), last has best Y
    steps.unshift({ x: first.x, y: yWorseEdge });   // extend first toward worse Y
    steps.push({ x: xWorseEdge, y: last.y });        // extend last toward worse X
  } else {
    // last has best X (highest), first has best Y
    steps.unshift({ x: xWorseEdge, y: first.y });    // extend first toward worse X
    steps.push({ x: last.x, y: yWorseEdge });        // extend last toward worse Y
  }

  return steps;
}
