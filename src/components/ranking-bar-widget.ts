/**
 * Ranking Bar Chart Widget
 *
 * Renders a bar chart showing where highlighted products rank among all
 * products in the same category for a given numeric spec axis.
 * Bars are sorted by value (ascending left→right). Highlighted products
 * are shown in vivid colors; others are dimmed.
 */

import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { type AxisDef, getAxisLabel, AXES, AXIS_MIN_POINTS, isVariantAxisId } from '../presets';
import { t } from '../i18n';
import { chartColors, isDarkTheme } from '../theme';
import { slugify } from '../views/product';

/* ── Constants ── */

const RANKING_BAR_HEIGHT = 250;
const MIN_BAR_WIDTH_FOR_LABEL = 40;
const NON_HIGHLIGHT_OPACITY = 0.4;
const HIGHLIGHT_OPACITY = 1.0;
const COLOR_OTHER_LIGHT = '#bfdbfe';
const COLOR_OTHER_DARK = '#1e3a5f';
const COLOR_PRODUCT_HIGHLIGHT = '#dc2626';

/* ── Types ── */

export interface RankingBarDataItem {
  product_id: string;
  brand_label: string;
  product_name: string;
  variant?: string | null;
  value: number;
}

export interface RankingBarConfig {
  /** Container element ID */
  id: string;
  /** Axis definition from AXES */
  axis: AxisDef;
  /** All products' data for this axis (will be sorted ascending) */
  data: RankingBarDataItem[];
  /** Map of product_id → highlight color */
  highlights: Map<string, string>;
  /** Chart height in px (default 250) */
  height?: number;
  /** Product ID to exclude from click navigation (e.g. self on product page) */
  selfProductId?: string;
  /** Disable click navigation on touch devices (prevents accidental taps) */
  noClickOnTouch?: boolean;
}

/* ── Value formatter (mirrors scatter-widget fmtAxis) ── */

function fmtValue(v: number, axis: AxisDef): string {
  if (axis.scale === 'year') return Math.round(v).toString();
  if (v === 0 && /^(amp|line)_output_impedance_ohm(_measured|_spec)?$/.test(axis.id)) return '≈0';
  if (v === 0) return '0';
  if (axis.id === 'weight_g' && v > 1000) {
    return parseFloat((v / 1000).toPrecision(3)).toString() + ' kg';
  }
  if (/^freq_(low|high)_hz(_measured|_spec)?$/.test(axis.id) && v >= 1000) {
    return parseFloat((v / 1000).toPrecision(3)).toString() + 'k';
  }
  const n = parseFloat(v.toPrecision(3));
  if (n !== 0 && Math.abs(n) < 0.001) {
    const digits = -Math.floor(Math.log10(Math.abs(n))) + 2;
    return n.toFixed(digits).replace(/\.?0+$/, '');
  }
  return n.toString();
}

function productLabel(item: RankingBarDataItem): string {
  if (item.variant && item.variant !== 'standard') {
    return `${item.brand_label} ${item.product_name} (${item.variant})`;
  }
  return `${item.brand_label} ${item.product_name}`;
}

function shortProductLabel(item: RankingBarDataItem): string {
  if (item.variant && item.variant !== 'standard') {
    return `${item.product_name} (${item.variant})`;
  }
  return item.product_name;
}

function hexToRgba(hex: string, alpha: number): string {
  // Handle already-rgba colors
  if (hex.startsWith('rgb')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Spread label positions to avoid overlaps, minimizing displacement.
 *
 * Algorithm:
 * 1. Group consecutive labels whose positions are within `minSpacing` into clusters.
 * 2. For each cluster, spread labels evenly (minSpacing apart) centered on
 *    the cluster's centroid. Isolated labels keep their original position.
 * 3. Clamp to [chartMin, chartMax] and re-compact if clamping causes new overlaps.
 *
 * @param positions  Sorted original positions (bar indices)
 * @param minSpacing Minimum distance between adjacent label centers
 * @param chartMin   Left bound (usually 0)
 * @param chartMax   Right bound (usually total - 1)
 * @returns          Resolved positions (same length, same order)
 */
function spreadLabels(
  positions: number[],
  minSpacing: number,
  chartMin: number,
  chartMax: number,
): number[] {
  const n = positions.length;
  if (n <= 1) return [...positions];

  // 1. Identify clusters: groups of labels that transitively overlap
  const clusters: number[][] = []; // each cluster is a list of indices into `positions`
  let cluster = [0];
  for (let i = 1; i < n; i++) {
    if (positions[i] - positions[cluster[cluster.length - 1]] < minSpacing) {
      cluster.push(i);
    } else {
      clusters.push(cluster);
      cluster = [i];
    }
  }
  clusters.push(cluster);

  // 2. For each cluster, spread symmetrically around centroid
  const resolved = new Array<number>(n);
  for (const cl of clusters) {
    if (cl.length === 1) {
      resolved[cl[0]] = positions[cl[0]];
      continue;
    }
    const centroid = cl.reduce((s, i) => s + positions[i], 0) / cl.length;
    const span = (cl.length - 1) * minSpacing;
    const left = centroid - span / 2;
    for (let j = 0; j < cl.length; j++) {
      resolved[cl[j]] = left + j * minSpacing;
    }
  }

  // 3. Clamp to chart bounds (push inward, compacting if needed)
  // Right edge
  if (resolved[n - 1] > chartMax) {
    const shift = resolved[n - 1] - chartMax;
    for (let i = n - 1; i >= 0; i--) {
      resolved[i] -= shift;
      if (i < n - 1 && resolved[i + 1] - resolved[i] < minSpacing) {
        // already compact, keep pushing left
      }
    }
  }
  // Left edge
  if (resolved[0] < chartMin) {
    const shift = chartMin - resolved[0];
    for (let i = 0; i < n; i++) {
      resolved[i] = Math.max(resolved[i] + shift, i === 0 ? chartMin : resolved[i - 1] + minSpacing);
    }
  }

  return resolved;
}

/**
 * Compute a y-axis range that focuses on the data range.
 * - For linear: [min - 5% padding, max + 15% padding]
 * - For log:    [log10(min) - 0.1, log10(max) + 0.15] (Plotly log range uses log10 units)
 * The extra top padding leaves room for annotations above the tallest bar.
 */
function computeYRange(dataMin: number, dataMax: number, isLog: boolean): [number, number] {
  if (isLog) {
    const logMin = Math.log10(Math.max(dataMin, 1e-10));
    const logMax = Math.log10(Math.max(dataMax, 1e-10));
    const logSpan = logMax - logMin || 1;
    return [logMin - logSpan * 0.05, logMax + logSpan * 0.15];
  }
  const span = dataMax - dataMin || 1;
  return [dataMin - span * 0.05, dataMax + span * 0.15];
}

/* ── Main render function ── */

export function renderRankingBarWidget(
  container: HTMLElement,
  config: RankingBarConfig,
): void {
  const { axis, highlights } = config;
  const height = config.height ?? RANKING_BAR_HEIGHT;
  const plotId = `ranking-bar-${config.id}`;

  const useLog = axis.scale === 'log';

  // For log-scale axes, filter out non-positive values (log(0) = -Infinity)
  const validData = useLog
    ? config.data.filter((d) => d.value > 0)
    : config.data;

  // Bars are always displayed left(low)→right(high).
  // Within ties, highlighted products are placed toward the "better" side
  // so their bar position matches the rank shown in the annotation.
  const betterIsHigher = axis.better === 'higher';
  const sorted = [...validData].sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    // Ties: highlighted products go toward the better end
    const aHl = highlights.has(a.product_id) ? 0 : 1;
    const bHl = highlights.has(b.product_id) ? 0 : 1;
    // better=higher → highlighted last (rightmost); better=lower → highlighted first (leftmost)
    return betterIsHigher ? bHl - aHl : aHl - bHl;
  });
  const total = sorted.length;
  if (total === 0) return;

  // Build rank map with tie handling (standard competition ranking: 1, 2, 2, 4, ...)
  // Rank 1 = best. For better=higher, rank from right (highest value = rank 1).
  // For better=lower, rank from left (lowest value = rank 1).
  const rankMap = new Map<string, number>();
  if (betterIsHigher) {
    // Traverse from right (highest) to left
    for (let i = total - 1; i >= 0; i--) {
      let rank = total - i;
      if (i < total - 1 && sorted[i].value === sorted[i + 1].value) {
        rank = rankMap.get(sorted[i + 1].product_id)!;
      }
      rankMap.set(sorted[i].product_id, rank);
    }
  } else {
    // Traverse from left (lowest) to right
    for (let i = 0; i < total; i++) {
      let rank = i + 1;
      if (i > 0 && sorted[i].value === sorted[i - 1].value) {
        rank = rankMap.get(sorted[i - 1].product_id)!;
      }
      rankMap.set(sorted[i].product_id, rank);
    }
  }

  // Compute data range for y-axis
  const dataMin = sorted[0].value;
  const dataMax = sorted[total - 1].value;

  // Determine colors and opacities
  const otherColor = isDarkTheme() ? COLOR_OTHER_DARK : COLOR_OTHER_LIGHT;
  const colors = sorted.map((item) => {
    const hlColor = highlights.get(item.product_id);
    return hlColor ?? otherColor;
  });
  const opacities = sorted.map((item) =>
    highlights.has(item.product_id) ? HIGHLIGHT_OPACITY : NON_HIGHLIGHT_OPACITY,
  );

  // X labels (index-based to avoid Plotly grouping issues)
  const xValues = sorted.map((_, i) => i);
  const yValues = sorted.map((item) => item.value);

  // Hover text
  const hoverTexts = sorted.map((item) => {
    const rank = rankMap.get(item.product_id)!;
    return `${productLabel(item)}<br>${getAxisLabel(axis)}: ${fmtValue(item.value, axis)}<br>${rank} / ${total}`;
  });

  // Container width for label decision
  container.innerHTML = `<div id="${plotId}" style="width:100%;height:${height}px"></div>`;
  const plotEl = document.getElementById(plotId);
  if (!plotEl) return;

  const containerWidth = container.clientWidth || 800;
  const showLabels = total <= Math.floor(containerWidth / MIN_BAR_WIDTH_FOR_LABEL);

  // Apply opacity by blending colors with alpha
  const colorsWithOpacity = sorted.map((item, i) => {
    const baseColor = colors[i];
    const opacity = opacities[i];
    return opacity < 1 ? hexToRgba(baseColor, opacity) : baseColor;
  });

  // Build Plotly trace
  const trace: Data = {
    x: xValues,
    y: yValues,
    type: 'bar',
    marker: {
      color: colorsWithOpacity,
    },
    // hovertext for tooltip only; text labels on bars are hidden via textposition
    hovertext: hoverTexts,
    hoverinfo: 'text',
    textposition: 'none',
    hoverlabel: {
      bgcolor: '#333',
      font: { color: '#fff', family: 'Inter, sans-serif', size: 12 },
    },
  };

  // Build annotations for highlighted products
  const cc = chartColors();
  const baseFontPx = 16;
  const currentFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize || `${baseFontPx}`);
  const fontScale = Number.isFinite(currentFontPx) ? currentFontPx / baseFontPx : 1;
  const isNarrow = window.innerWidth <= 540;

  const annotations: Array<Record<string, unknown>> = [];

  // Highlight annotations (product name + value + rank above bar)
  // IMPORTANT: On Plotly log-scale axes, annotation y coordinates must be
  // in log10 units (e.g. y=2 means 10^2=100). Raw values would be interpreted
  // as 10^value, causing the axis autorange to blow up to absurd exponents.
  const highlightIndices = sorted
    .map((item, i) => highlights.has(item.product_id) ? i : -1)
    .filter((i) => i >= 0);

  // ── Smart annotation placement (max 2 rows, cluster-based spread) ──
  // Fixed 2 vertical rows. Within each row, overlapping labels are grouped
  // into clusters and spread symmetrically around the cluster centroid.
  // Isolated labels stay exactly at their bar position (ax=0).
  const MAX_ROWS = 2;
  const rowAy = [-25, -55];
  const pxPerBar = total > 1 ? (containerWidth * 0.85) / total : containerWidth;
  const labelWidthPx = isNarrow ? 80 : 100;
  const minSpacing = labelWidthPx / Math.max(pxPerBar, 1); // min gap in bar-index units

  // Sort highlights by x index
  const hlByX = highlightIndices
    .map((idx, hi) => ({ idx, hi }))
    .sort((a, b) => a.idx - b.idx);

  // Distribute into rows: round-robin by sorted order
  const rows: Array<typeof hlByX> = Array.from({ length: MAX_ROWS }, () => []);
  hlByX.forEach((h, i) => rows[i % MAX_ROWS].push(h));

  const axOffsets = new Map<number, number>();
  const chartMin = 0;
  const chartMax = total - 1;

  for (const row of rows) {
    if (row.length === 0) continue;
    const positions = row.map((h) => h.idx);
    const resolved = spreadLabels(positions, minSpacing, chartMin, chartMax);
    for (let i = 0; i < row.length; i++) {
      axOffsets.set(row[i].hi, (resolved[i] - positions[i]) * pxPerBar);
    }
  }

  const rowAssignment = new Map<number, number>();
  hlByX.forEach((h, i) => rowAssignment.set(h.hi, i % MAX_ROWS));
  const usedRowCount = Math.min(MAX_ROWS, highlightIndices.length);

  for (let hi = 0; hi < highlightIndices.length; hi++) {
    const idx = highlightIndices[hi];
    const item = sorted[idx];
    const rank = rankMap.get(item.product_id)!;
    const yAnnot = useLog ? Math.log10(item.value) : item.value;
    const row = rowAssignment.get(hi) ?? 0;
    const ayPx = usedRowCount > 1 ? rowAy[row] : rowAy[0];
    const axPx = axOffsets.get(hi) ?? 0;
    annotations.push({
      x: idx,
      y: yAnnot,
      xref: 'x',
      yref: 'y',
      text: `<b>${shortProductLabel(item)}</b><br>${fmtValue(item.value, axis)} (${rank}/${total})`,
      showarrow: true,
      arrowhead: 0,
      arrowwidth: 1,
      arrowcolor: highlights.get(item.product_id) || COLOR_PRODUCT_HIGHLIGHT,
      ax: axPx,
      ay: ayPx,
      font: {
        size: (isNarrow ? 10 : 11) * fontScale,
        color: cc.fontColor || '#333',
        family: 'Inter, sans-serif',
      },
      bgcolor: cc.annotationBg,
      borderpad: 3,
    });
  }

  // Better direction annotation
  const betterLabel = t('common.better');
  if (axis.better) {
    const isRight = axis.better === 'higher';
    annotations.push({
      xref: 'paper',
      yref: 'paper',
      x: isRight ? 0.99 : 0.01,
      y: -0.02,
      xanchor: isRight ? 'right' : 'left',
      yanchor: 'top',
      showarrow: false,
      text: isRight ? `${betterLabel} →` : `← ${betterLabel}`,
      font: { size: 11 * fontScale, color: cc.betterLabelColor, family: 'Inter, sans-serif' },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layout: Partial<Layout> & Record<string, any> = {
    xaxis: {
      showticklabels: showLabels,
      tickvals: showLabels ? xValues : undefined,
      ticktext: showLabels ? sorted.map((item) => {
        const name = shortProductLabel(item);
        return name.length > 20 ? name.slice(0, 18) + '…' : name;
      }) : undefined,
      tickangle: showLabels ? -45 : undefined,
      tickfont: { size: (isNarrow ? 8 : 10) * fontScale },
      fixedrange: true,
      gridcolor: cc.gridcolor,
    } as Layout['xaxis'],
    yaxis: {
      title: {
        text: getAxisLabel(axis),
        font: { family: 'Inter, sans-serif', size: 12 * fontScale, color: cc.axisTitleColor },
        standoff: (isNarrow ? 4 : 8) * fontScale,
      },
      type: useLog ? 'log' : 'linear',
      // Set explicit range so bars don't start from 0 (which makes linear-scale
      // charts like year/SINAD useless) and log-scale charts have correct bounds.
      range: computeYRange(dataMin, dataMax, useLog),
      gridcolor: cc.gridcolor,
      zerolinecolor: cc.zerolinecolor,
      fixedrange: true,
    } as Layout['yaxis'],
    paper_bgcolor: cc.paper_bgcolor,
    plot_bgcolor: cc.plot_bgcolor,
    font: {
      family: 'Inter, sans-serif',
      size: 11 * fontScale,
      ...(cc.fontColor ? { color: cc.fontColor } : {}),
    },
    margin: {
      l: (isNarrow ? 45 : 60) * fontScale,
      r: (isNarrow ? 8 : 15) * fontScale,
      t: (usedRowCount > 1 ? 75 : 45) * fontScale,
      b: (showLabels ? (isNarrow ? 80 : 100) : (isNarrow ? 25 : 35)) * fontScale,
    },
    bargap: 0.05,
    hovermode: 'closest',
    showlegend: false,
    annotations: annotations as Layout['annotations'],
    dragmode: false,
  };

  const plotConfig: Partial<Config> = {
    responsive: true,
    displayModeBar: false,
    displaylogo: false,
    scrollZoom: false,
  };

  Plotly.react(plotId, [trace], layout, plotConfig);

  // ── Click handler: navigate to product page ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gd = plotEl as any;
  gd.on('plotly_click', (eventData: { points: Array<{ pointIndex: number }> }) => {
    // Prevent accidental taps on touch devices (product page / compare tab)
    if (config.noClickOnTouch && window.matchMedia('(pointer: coarse)').matches) return;
    const pt = eventData.points[0];
    if (!pt) return;
    const item = sorted[pt.pointIndex];
    if (!item) return;
    // Don't navigate if clicking on self (product page)
    if (config.selfProductId && item.product_id === config.selfProductId) return;
    const brand = item.brand_label || 'unknown';
    const url = `/product/${slugify(brand)}/${slugify(item.product_name)}`;
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

/* ── Helper: get ranking-eligible axes (axes with `better` defined) ── */

export function getRankingAxes(splitMode: boolean): AxisDef[] {
  const allIds = new Set(AXES.map((a) => a.id));
  const hasVariants = (id: string) =>
    allIds.has(`${id}_measured`) || allIds.has(`${id}_spec`);

  return AXES.filter((a) => {
    if (!a.better) return false;
    if (splitMode) {
      // In split mode, show variant axes, hide base axes that have variants
      return isVariantAxisId(a.id) || !hasVariants(a.id);
    }
    // In normal mode, hide variant axes
    return !isVariantAxisId(a.id);
  });
}

/* ── Helper: build ranking data from category query result ── */

export function buildRankingData(
  allProducts: Record<string, unknown>[],
  axisId: string,
): RankingBarDataItem[] {
  const items: RankingBarDataItem[] = [];
  for (const row of allProducts) {
    const val = row[axisId];
    if (val == null || typeof val !== 'number' || !Number.isFinite(val)) continue;
    items.push({
      product_id: row.product_id as string,
      brand_label: (row.brand_label || row.brand_name_en || 'unknown') as string,
      product_name: row.product_name as string,
      variant: row.variant as string | undefined,
      value: val,
    });
  }
  return items;
}

/* ── Ranking list helper ── */

function populateRankingList(
  listEl: HTMLElement,
  data: RankingBarDataItem[],
  axis: AxisDef,
  highlights: Map<string, string>,
): void {
  const total = data.length;
  if (total === 0) return;

  const betterIsHigher = axis.better === 'higher';
  const useLog = axis.scale === 'log';
  const validData = useLog ? data.filter((d) => d.value > 0) : data;
  const totalValid = validData.length;

  // Sort ascending by value
  const sorted = [...validData].sort((a, b) => a.value - b.value);

  // Build rank map (standard competition ranking, rank 1 = best)
  const rankMap = new Map<string, number>();
  if (betterIsHigher) {
    for (let i = totalValid - 1; i >= 0; i--) {
      let rank = totalValid - i;
      if (i < totalValid - 1 && sorted[i].value === sorted[i + 1].value) {
        rank = rankMap.get(sorted[i + 1].product_id)!;
      }
      rankMap.set(sorted[i].product_id, rank);
    }
  } else {
    for (let i = 0; i < totalValid; i++) {
      let rank = i + 1;
      if (i > 0 && sorted[i].value === sorted[i - 1].value) {
        rank = rankMap.get(sorted[i - 1].product_id)!;
      }
      rankMap.set(sorted[i].product_id, rank);
    }
  }

  // Count how many products share each rank (for tie ranges)
  const tieCount = new Map<number, number>();
  for (const [, rank] of rankMap) {
    tieCount.set(rank, (tieCount.get(rank) ?? 0) + 1);
  }

  // Build list items for highlighted products, sorted by rank (best first)
  const hlItems = sorted
    .filter((item) => highlights.has(item.product_id) && rankMap.has(item.product_id))
    .map((item) => ({ item, rank: rankMap.get(item.product_id)! }))
    .sort((a, b) => a.rank - b.rank);

  const fmtPct = (v: number) => (((v - 1) / totalValid) * 100).toFixed(1).replace(/\.0$/, '');

  const items: string[] = [];
  for (const { item, rank } of hlItems) {
    const ties = tieCount.get(rank) ?? 1;
    const pctMin = fmtPct(rank);
    const pctMax = fmtPct(rank + ties - 1);
    const pct = ties > 1 ? `${pctMin}~${pctMax}` : pctMin;
    const color = highlights.get(item.product_id)!;
    const rankText = t('ranking.format')
      .replace('{rank}', String(rank))
      .replace('{total}', String(totalValid))
      .replace('{pct}', pct);
    items.push(
      `<li><span class="ranking-list-dot" style="background:${color}"></span>${productLabel(item)}：${rankText}</li>`,
    );
  }

  listEl.innerHTML = `<ul>${items.join('')}</ul>`;
}

/* ── Lazy-rendering section factory ── */

/**
 * Create a ranking bar section with IntersectionObserver-based lazy rendering.
 * Returns the section container element.
 */
export function createRankingSection(
  parentEl: HTMLElement,
  axes: AxisDef[],
  allProducts: Record<string, unknown>[],
  highlights: Map<string, string>,
  sectionTitle: string,
  selfProductId?: string,
  noClickOnTouch?: boolean,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'card';
  section.style.marginTop = '1rem';

  const body = document.createElement('div');
  body.className = 'card-body';

  const h3 = document.createElement('h3');
  h3.style.margin = '0 0 0.5rem';
  h3.textContent = sectionTitle;
  body.appendChild(h3);

  // Filter axes: only those with enough data points and at least one highlighted product having a value
  const eligibleAxes = axes.filter((axis) => {
    const data = buildRankingData(allProducts, axis.id);
    if (data.length < AXIS_MIN_POINTS) return false;
    // Check highlight condition
    const highlightedWithValue = data.filter((d) => highlights.has(d.product_id));
    return highlightedWithValue.length >= (highlights.size === 1 ? 1 : 2);
  });

  if (eligibleAxes.length === 0) return section; // empty, caller can skip

  // Create placeholder containers
  const plotContainers: { el: HTMLElement; axis: AxisDef; listEl: HTMLElement; rendered: boolean }[] = [];

  for (const axis of eligibleAxes) {
    // Title: axis label
    const titleEl = document.createElement('div');
    titleEl.className = 'ranking-bar-title';
    titleEl.textContent = getAxisLabel(axis);
    body.appendChild(titleEl);

    // Description hint (reuse axisdesc tooltip text)
    const descKey = `axisdesc.${axis.id}`;
    const desc = t(descKey);
    if (desc !== descKey) {
      const descEl = document.createElement('div');
      descEl.className = 'ranking-bar-desc';
      descEl.textContent = desc;
      body.appendChild(descEl);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'ranking-bar-wrapper';
    wrapper.style.marginBottom = '0';
    wrapper.style.minHeight = '250px';
    body.appendChild(wrapper);

    // Ranking list placeholder (populated on render)
    const listEl = document.createElement('div');
    listEl.className = 'ranking-bar-list';
    body.appendChild(listEl);

    plotContainers.push({ el: wrapper, axis, listEl, rendered: false });
  }

  section.appendChild(body);
  parentEl.appendChild(section);

  // IntersectionObserver for lazy rendering (render once, keep forever)
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const container = plotContainers.find((c) => c.el === entry.target);
        if (!container || container.rendered) continue;

        const data = buildRankingData(allProducts, container.axis.id);
        renderRankingBarWidget(container.el, {
          id: `${container.axis.id}-${Date.now()}`,
          axis: container.axis,
          data,
          highlights,
          selfProductId,
          noClickOnTouch,
        });

        // Populate ranking list for highlighted products
        populateRankingList(container.listEl, data, container.axis, highlights);

        container.rendered = true;
        observer.unobserve(container.el);
      }
    },
    { rootMargin: '300px' },
  );

  for (const c of plotContainers) {
    observer.observe(c.el);
  }

  return section;
}
