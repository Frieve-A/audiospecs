import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { query } from '../db/database';
import { getAxis, getAxisLabel, getCategoryLabel, buildBetterAnnotations, type AxisDef } from '../presets';
import { t, getLocale } from '../i18n';
import { navigate } from '../router';
import { fetchSourceUrls } from '../sources';

const CATEGORY_COLORS: Record<string, string> = {
  headphone: '#7c3aed',
  iem: '#db2777',
  dac: '#2563eb',
  headphone_amp: '#059669',
  speaker: '#d97706',
  speaker_amp: '#9333ea',
  mic: '#0891b2',
  usb_interface: '#64748b',
};

function fmtAxis(v: number, axis: { id?: string; scale: string }): string {
  if (axis.scale === 'year') return Math.round(v).toString();
  if (v === 0) return '0';
  if (axis.id === 'spec_weight_g' && v > 1000) {
    return parseFloat((v / 1000).toPrecision(3)).toString() + ' kg';
  }
  if ((axis.id === 'spec_freq_low_hz' || axis.id === 'spec_freq_high_hz') && v >= 1000) {
    return parseFloat((v / 1000).toPrecision(3)).toString() + 'k';
  }
  const n = parseFloat(v.toPrecision(3));
  if (n !== 0 && Math.abs(n) < 0.001) {
    const digits = -Math.floor(Math.log10(Math.abs(n))) + 2;
    return n.toFixed(digits).replace(/\.?0+$/, '');
  }
  return n.toString();
}

type RowType = {
  product_id: string;
  brand_label: string;
  product_name: string;
  category_primary: string;
  x_val: number;
  y_val: number;
  brand_name_en: string;
  price_anchor_usd: number | null;
};

export interface ScatterWidgetConfig {
  id: string;
  categories: string[];
  x: string;
  y: string;
  color: string;
  height?: number;
  /** When true, hide toolbar and disable drag/zoom (hover & context menu still work) */
  staticChart?: boolean;
}

// Global context menu dismiss — registered once
let ctxDismissSetup = false;
function ensureCtxDismiss(): void {
  if (ctxDismissSetup) return;
  ctxDismissSetup = true;
  const dismiss = (e: Event) => {
    if (!(e.target as HTMLElement).closest('.scatter-ctx-menu')) {
      document.querySelector('.scatter-ctx-menu')?.remove();
    }
  };
  document.addEventListener('click', dismiss);
  document.addEventListener('touchstart', dismiss);
}

export async function renderScatterWidget(
  container: HTMLElement,
  config: ScatterWidgetConfig,
): Promise<void> {
  const plotId = `scatter-widget-${config.id}`;
  const height = config.height ?? 450;

  container.innerHTML = `
    <div class="scatter-container">
      <div id="${plotId}" style="width:100%;height:${height}px"></div>
    </div>
  `;

  const xAxis = getAxis(config.x);
  const yAxis = getAxis(config.y);
  if (!xAxis || !yAxis) return;

  const cats = config.categories;
  const catPlaceholders = cats.map(() => '?').join(',');
  const xSource = xAxis.source || xAxis.id;
  const ySource = yAxis.source || yAxis.id;

  const sql = `
    SELECT
      p.product_id,
      CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END as brand_label,
      p.product_name,
      p.category_primary,
      ${xSource} as x_val,
      ${ySource} as y_val,
      p.brand_name_en,
      coalesce(p.street_price_usd, p.msrp_usd) as price_anchor_usd
    FROM web_product_core p
    WHERE p.category_primary IN (${catPlaceholders})
      AND x_val IS NOT NULL
      AND y_val IS NOT NULL
  `;

  const rows = await query<RowType>(sql, cats);

  const colorField = config.color as 'category_primary' | 'brand_name_en';
  const groups = new Map<string, RowType[]>();
  for (const row of rows) {
    const key = colorField === 'category_primary'
      ? row.category_primary
      : (row.brand_label || t('common.unknown'));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const traceRows: RowType[][] = [];
  let traces: Data[];

  if (colorField === 'brand_name_en' && groups.size > 15) {
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const top = sorted.slice(0, 12);
    const rest = sorted.slice(12).flatMap(([, v]) => v);
    traces = top.map(([name, data]) => {
      traceRows.push(data);
      return makeTrace(name, data, xAxis, yAxis);
    });
    if (rest.length) {
      traceRows.push(rest);
      traces.push(makeTrace('Other', rest, xAxis, yAxis, '#999'));
    }
  } else {
    traces = [...groups.entries()].map(([name, data]) => {
      traceRows.push(data);
      const displayName = colorField === 'category_primary' ? getCategoryLabel(name) : name;
      const color = colorField === 'category_primary' ? CATEGORY_COLORS[name] : undefined;
      return makeTrace(displayName, data, xAxis, yAxis, color);
    });
  }

  const xLabel = getAxisLabel(xAxis);
  const yLabel = getAxisLabel(yAxis);
  const baseFontPx = 14;
  const currentFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize || `${baseFontPx}`);
  const fontScale = Number.isFinite(currentFontPx) ? currentFontPx / baseFontPx : 1.25;

  const axisTitleFont = {
    family: 'Inter, sans-serif',
    size: 13 * fontScale,
    color: '#374151',
    weight: 600,
  };

  const isStatic = config.staticChart ?? false;

  const layout: Partial<Layout> = {
    xaxis: {
      title: { text: xLabel, font: axisTitleFont, standoff: 10 * fontScale },
      type: xAxis.scale === 'log' ? 'log' : 'linear',
      gridcolor: '#eee',
      zerolinecolor: '#ddd',
      ...(isStatic ? { fixedrange: true } : {}),
    },
    yaxis: {
      title: { text: yLabel, font: axisTitleFont, standoff: 10 * fontScale },
      type: yAxis.scale === 'log' ? 'log' : 'linear',
      gridcolor: '#eee',
      zerolinecolor: '#ddd',
      ...(isStatic ? { fixedrange: true } : {}),
    },
    paper_bgcolor: 'transparent',
    plot_bgcolor: '#fff',
    font: { family: 'Inter, sans-serif', size: 12 * fontScale },
    margin: { l: 70 * fontScale, r: 20 * fontScale, t: 20 * fontScale, b: 55 * fontScale },
    legend: {
      orientation: 'h',
      y: -0.15 * fontScale,
      font: { size: 11 * fontScale },
    },
    hovermode: 'closest',
    ...(isStatic ? { dragmode: false } : {}),
  };

  const plotConfig: Partial<Config> = {
    responsive: true,
    displayModeBar: !isStatic,
    ...(isStatic ? {} : { modeBarButtonsToRemove: ['lasso2d', 'select2d'] }),
    displaylogo: false,
    scrollZoom: isStatic ? false : undefined,
  };

  const rAnnotation = {
    xref: 'paper' as const,
    yref: 'paper' as const,
    x: 0.99,
    y: 0.99,
    xanchor: 'right' as const,
    yanchor: 'top' as const,
    showarrow: false,
    font: { size: 13 * fontScale, color: '#555', family: 'Inter, sans-serif' },
    bgcolor: 'rgba(255,255,255,0.8)',
    borderpad: 4,
    text: '',
  };

  const xAxisDef = xAxis;
  const yAxisDef = yAxis;
  const betterAnnotations = buildBetterAnnotations(xAxis, yAxis, fontScale);
  function updateRAnnotation(visibleIndices?: Set<number>): void {
    const visibleRows = visibleIndices
      ? traceRows.filter((_, i) => visibleIndices.has(i)).flat()
      : rows;
    const r = calcCorrelation(visibleRows, xAxisDef, yAxisDef);
    rAnnotation.text = r !== null ? `R = ${r.toFixed(3)}` : '';
    layout.annotations = [
      ...(rAnnotation.text ? [rAnnotation] : []),
      ...betterAnnotations,
    ];
  }

  updateRAnnotation();
  await Plotly.react(plotId, traces, layout, plotConfig);

  // ── Context menu ──
  ensureCtxDismiss();

  const plotEl = document.getElementById(plotId)!;
  type HoverData = { curveNumber: number; pointIndex: number };
  type PlotlyEl = HTMLElement & { _hoverdata?: HoverData[] };
  type PlotlyGd = HTMLElement & { data?: Array<{ visible?: boolean | 'legendonly' }> };

  // Predict visibility state after a legend click/doubleclick, then update R
  function getVisibility(): boolean[] {
    const gd2 = plotEl as PlotlyGd;
    if (!gd2.data) return [];
    return gd2.data.map((tr) => tr.visible !== false && tr.visible !== 'legendonly');
  }

  function recalcRWith(visible: Set<number>): void {
    updateRAnnotation(visible);
    Plotly.relayout(plotId, { annotations: layout.annotations || [] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gd = plotEl as any;
  gd.on('plotly_legendclick', (evt: { curveNumber: number }) => {
    const cur = getVisibility();
    // Plotly will toggle the clicked trace
    cur[evt.curveNumber] = !cur[evt.curveNumber];
    const visible = new Set<number>();
    cur.forEach((v, i) => { if (v) visible.add(i); });
    setTimeout(() => recalcRWith(visible), 0);
  });
  gd.on('plotly_legenddoubleclick', (evt: { curveNumber: number }) => {
    const cur = getVisibility();
    const allVisible = cur.every(Boolean);
    const onlyThisVisible = cur.every((v, i) => v === (i === evt.curveNumber));
    const visible = new Set<number>();
    if (onlyThisVisible || allVisible) {
      // If only this one is visible or all are visible → Plotly will isolate this trace (or show all)
      if (onlyThisVisible) {
        // Restore all
        cur.forEach((_, i) => visible.add(i));
      } else {
        // Isolate clicked
        visible.add(evt.curveNumber);
      }
    } else {
      // Some hidden: Plotly isolates clicked trace
      visible.add(evt.curveNumber);
    }
    setTimeout(() => recalcRWith(visible), 0);
  });

  function getRow(pt: HoverData): RowType | undefined {
    return traceRows[pt.curveNumber]?.[pt.pointIndex];
  }

  function showCtxMenu(cx: number, cy: number, row: RowType): void {
    document.querySelector('.scatter-ctx-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'scatter-ctx-menu';
    menu.innerHTML = `
      <button data-action="compare">${t('analysis.ctx.add_compare')}</button>
      <button data-action="google">${t('analysis.ctx.search_google')}</button>
      <button data-action="amazon">${t('analysis.ctx.search_amazon')}</button>
    `;
    menu.style.left = `${cx}px`;
    menu.style.top = `${cy}px`;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;

    const searchQuery = `${row.brand_label} ${row.product_name}`.trim();

    menu.querySelector('[data-action="compare"]')!.addEventListener('click', () => {
      document.querySelector('.scatter-ctx-menu')?.remove();
      let ids: string[] = [];
      try { ids = JSON.parse(sessionStorage.getItem('compare_ids') || '[]'); } catch { /* empty */ }
      if (!ids.includes(row.product_id) && ids.length < 5) {
        ids.push(row.product_id);
        sessionStorage.setItem('compare_ids', JSON.stringify(ids));
        navigate('compare', { ids: ids.join(',') });
      }
    });

    menu.querySelector('[data-action="google"]')!.addEventListener('click', () => {
      document.querySelector('.scatter-ctx-menu')?.remove();
      window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, '_blank');
    });

    menu.querySelector('[data-action="amazon"]')!.addEventListener('click', () => {
      document.querySelector('.scatter-ctx-menu')?.remove();
      const url = getLocale() === 'ja'
        ? `https://www.amazon.co.jp/s?k=${encodeURIComponent(searchQuery)}&tag=frieve02-22`
        : `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&tag=frieve-20`;
      window.open(url, '_blank');
    });

    fetchSourceUrls(row.product_id, [config.x, config.y]).then((urls) => {
      if (urls.length === 0 || !document.body.contains(menu)) return;
      const sep = document.createElement('div');
      sep.className = 'ctx-menu-separator';
      menu.appendChild(sep);
      const label = document.createElement('div');
      label.className = 'ctx-menu-label';
      label.textContent = t('analysis.ctx.sources');
      menu.appendChild(label);
      for (const url of urls) {
        const a = document.createElement('a');
        a.className = 'ctx-menu-source';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        try { a.textContent = new URL(url).hostname; } catch { a.textContent = url; }
        a.title = url;
        menu.appendChild(a);
      }
      const r2 = menu.getBoundingClientRect();
      if (r2.right > window.innerWidth) menu.style.left = `${window.innerWidth - r2.width - 8}px`;
      if (r2.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - r2.height - 8}px`;
    }).catch(() => {});
  }

  plotEl.addEventListener('contextmenu', (e) => {
    const hovered = (plotEl as PlotlyEl)._hoverdata;
    if (hovered && hovered.length > 0) {
      e.preventDefault();
      const row = getRow(hovered[0]);
      if (row) showCtxMenu(e.clientX, e.clientY, row);
    }
  });

  let longTapTimer: ReturnType<typeof setTimeout> | null = null;
  plotEl.addEventListener('touchstart', (e) => {
    longTapTimer = setTimeout(() => {
      const hovered = (plotEl as PlotlyEl)._hoverdata;
      if (hovered && hovered.length > 0) {
        const row = getRow(hovered[0]);
        if (row) {
          e.preventDefault();
          const touch = e.changedTouches[0] || e.touches[0];
          showCtxMenu(touch.clientX, touch.clientY, row);
        }
      }
    }, 500);
  }, { passive: false });
  plotEl.addEventListener('touchend', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
  plotEl.addEventListener('touchmove', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
}

function calcCorrelation(rows: RowType[], xAxis: AxisDef, yAxis: AxisDef): number | null {
  if (rows.length < 3) return null;
  const pairs: [number, number][] = [];
  for (const r of rows) {
    let x = r.x_val;
    let y = r.y_val;
    if (xAxis.scale === 'log') { if (x <= 0) continue; x = Math.log10(x); }
    if (yAxis.scale === 'log') { if (y <= 0) continue; y = Math.log10(y); }
    pairs.push([x, y]);
  }
  if (pairs.length < 3) return null;
  const n = pairs.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pairs) {
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom;
}

function makeTrace(
  name: string,
  data: RowType[],
  xAxis: AxisDef,
  yAxis: AxisDef,
  color?: string,
): Data {
  const xLabel = getAxisLabel(xAxis);
  const yLabel = getAxisLabel(yAxis);
  return {
    x: data.map((d) => d.x_val),
    y: data.map((d) => d.y_val),
    mode: 'markers',
    type: 'scatter',
    name,
    marker: {
      size: 7,
      opacity: 0.75,
      ...(color ? { color } : {}),
    },
    text: data.map((d) => {
      const isPriceAxis = xAxis.id === 'price_anchor_usd' || xAxis.id === 'msrp_usd'
        || yAxis.id === 'price_anchor_usd' || yAxis.id === 'msrp_usd';
      let tip = `${d.brand_label} ${d.product_name}<br>${xLabel}: ${fmtAxis(d.x_val, xAxis)}<br>${yLabel}: ${fmtAxis(d.y_val, yAxis)}`;
      if (!isPriceAxis) {
        tip += `<br>${t('common.price')}: ${d.price_anchor_usd ? '$' + d.price_anchor_usd.toLocaleString() : t('common.na')}`;
      }
      return tip;
    }),
    hoverinfo: 'text',
  } as Data;
}
