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
  { id: 'perf_sinad_db', source: 'perf_sinad_db', label: 'SINAD (dB)', scale: 'linear', better: 'higher' },
  { id: 'perf_snr_db', source: 'perf_snr_db', label: 'SNR (dB)', scale: 'linear', better: 'higher' },
  { id: 'perf_thd_percent', source: 'perf_thd_percent', label: 'THD (%)', scale: 'log', better: 'lower' },
  { id: 'perf_dynamic_range_db', source: 'perf_dynamic_range_db', label: 'Dynamic Range (dB)', scale: 'linear', better: 'higher' },
  { id: 'perf_crosstalk_db', source: 'perf_crosstalk_db', label: 'Crosstalk (dB)', scale: 'linear', better: 'lower' },
  // Spec / Driveability
  { id: 'spec_impedance_ohm', source: 'spec_impedance_ohm', label: 'Impedance (Ω)', scale: 'log' },
  { id: 'sensitivity_proxy_db', source: 'sensitivity_proxy_db', label: 'Sensitivity Proxy (dB)', scale: 'linear', better: 'higher' },
  { id: 'driveability_index', source: 'driveability_index', label: 'Driveability', scale: 'linear', better: 'higher' },
  { id: 'spec_weight_g', source: 'spec_weight_g', label: 'Weight (g)', scale: 'log', better: 'lower' },
  { id: 'driver_total_count', source: 'driver_total_count', label: 'Driver Count', scale: 'linear' },
  { id: 'spec_freq_low_hz', source: 'spec_freq_low_hz', label: 'Freq Low (Hz)', scale: 'log', better: 'lower' },
  { id: 'spec_freq_high_hz', source: 'spec_freq_high_hz', label: 'Freq High (Hz)', scale: 'log', better: 'higher' },
  // FR Harman (Headphone / IEM)
  { id: 'perf_fr_harman_std_db', source: 'perf_fr_harman_std_db', label: 'FR Harman Std Dev (dB)', scale: 'linear', better: 'lower' },
  { id: 'perf_fr_harman_avg_db', source: 'perf_fr_harman_avg_db', label: 'FR Harman Avg Dev (dB)', scale: 'linear', better: 'lower' },
  // Amp output
  { id: 'amp_power_mw_32ohm', source: 'amp_power_mw_32ohm', label: 'Headphone Output Power (mW @ 32Ω)', scale: 'log', better: 'higher' },
  { id: 'amp_power_w', source: 'amp_power_w', label: 'Speaker Output Power (W)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms', source: 'amp_voltage_vrms', label: 'Output Voltage SE (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_voltage_vrms_balanced', source: 'amp_voltage_vrms_balanced', label: 'Output Voltage BAL (Vrms)', scale: 'log', better: 'higher' },
  { id: 'amp_output_impedance_ohm', source: 'amp_output_impedance_ohm', label: 'Output Impedance (Ω)', scale: 'log', better: 'lower' },
];

export const PRESETS: Preset[] = [
  // DAC / amp
  { id: 'msrp_vs_sinad', x: 'price_anchor_usd', y: 'perf_sinad_db', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs measured quality' },
  { id: 'msrp_vs_thd', x: 'price_anchor_usd', y: 'perf_thd_percent', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs distortion' },
  { id: 'thd_vs_sinad', x: 'perf_thd_percent', y: 'perf_sinad_db', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Correlation between perf metrics' },
  { id: 'release_vs_sinad', x: 'release_year', y: 'perf_sinad_db', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Technology evolution' },
  // Headphone / IEM
  { id: 'impedance_vs_sensitivity', x: 'spec_impedance_ohm', y: 'sensitivity_proxy_db', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Driveability overview' },
  { id: 'msrp_vs_driveability', x: 'price_anchor_usd', y: 'driveability_index', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs driveability' },
  { id: 'release_vs_driveability', x: 'release_year', y: 'driveability_index', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Era vs driveability' },
  { id: 'msrp_vs_weight', x: 'price_anchor_usd', y: 'spec_weight_g', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs physical weight' },
  // FR Harman
  { id: 'msrp_vs_harman_std', x: 'price_anchor_usd', y: 'perf_fr_harman_std_db', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs FR Harman deviation' },
  { id: 'msrp_vs_harman_avg', x: 'price_anchor_usd', y: 'perf_fr_harman_avg_db', color: 'brand_name_en', categories: ['headphone', 'iem'], purpose: 'Price vs FR Harman avg deviation' },
  // Frequency range
  { id: 'msrp_vs_freq_range', x: 'spec_freq_low_hz', y: 'spec_freq_high_hz', color: 'brand_name_en', categories: ['headphone', 'iem', 'speaker'], purpose: 'Frequency range overview' },
  // Amp output
  { id: 'msrp_vs_power_32ohm', x: 'price_anchor_usd', y: 'amp_power_mw_32ohm', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs headphone output power' },
  { id: 'msrp_vs_output_impedance', x: 'price_anchor_usd', y: 'amp_output_impedance_ohm', color: 'brand_name_en', categories: ['dac', 'headphone_amp'], purpose: 'Price vs output impedance' },
  { id: 'msrp_vs_speaker_power', x: 'price_anchor_usd', y: 'amp_power_w', color: 'brand_name_en', categories: ['speaker', 'speaker_amp'], purpose: 'Price vs speaker output power' },
];

/** Get localized axis label */
export function getAxisLabel(axis: AxisDef): string {
  return tAxis(axis.id);
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

/** Axes whose 0 values should be clamped to a floor for log-scale display */
const LOG_CLAMP_AXES: Record<string, number> = {
  amp_output_impedance_ohm: 0.01,
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
