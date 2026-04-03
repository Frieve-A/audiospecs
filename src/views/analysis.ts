import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { query } from '../db/database';
import { PRESETS, getAxis, getAxesForCategories, getValidCategories, getPresetsForCategories, getCategoryLabel, getAxisLabel, getPresetPurpose, type Preset } from '../presets';
import { t, getLocale } from '../i18n';
import { navigate } from '../router';
import { columnToPatterns, fetchSourceUrls } from '../sources';

/** Format a number for tooltip display: 3 significant digits, but year axes stay as 4-digit integers */
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

export async function renderAnalysis(
  container: HTMLElement,
  params: URLSearchParams,
): Promise<void> {
  const STORAGE_KEY = 'analysis_state';

  function loadStoredState(): Record<string, string> {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveState(): void {
    const s: Record<string, string> = {
      preset: currentPreset?.id || '',
      x: currentX,
      y: currentY,
      color: currentColor,
    };
    if (selectedCats.length) s.cat = selectedCats.join(',');
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  // Merge: URL params > sessionStorage > defaults
  const stored = loadStoredState();
  const presetId = params.get('preset') || stored.preset || 'msrp_vs_sinad';
  const catParam = params.get('cat') || stored.cat || '';

  container.innerHTML = `
    <div class="view-header">
      <h1>${t('analysis.title')}</h1>
      <p>${t('analysis.subtitle')}</p>
    </div>
    <div class="controls-bar" id="analysis-controls"></div>
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">
      <div id="analysis-presets" class="preset-bar" style="flex:1;margin-bottom:0"></div>
      <button id="analysis-reset">${t('common.reset')}</button>
    </div>
    <div id="analysis-warning"></div>
    <div class="scatter-container">
      <div id="scatter-plot" style="width:100%;height:550px"></div>
    </div>
  `;

  const controlsEl = document.getElementById('analysis-controls')!;
  const presetsEl = document.getElementById('analysis-presets')!;
  const warningEl = document.getElementById('analysis-warning')!;

  // Category filter — only categories with enough data for scatter plots
  const allCats = await getValidCategories(query);
  let selectedCats: string[] = catParam
    ? catParam.split(',').filter((c) => allCats.includes(c))
    : [];

  // State — restore from URL > sessionStorage > defaults
  let currentPreset: Preset | undefined = PRESETS.find((p) => p.id === presetId);
  let currentX = params.get('x') || stored.x || currentPreset?.x || 'price_anchor_usd';
  let currentY = params.get('y') || stored.y || currentPreset?.y || 'perf_sinad_db';
  let currentColor = params.get('color') || stored.color || currentPreset?.color || 'category_primary';

  function syncUrl(): void {
    const p: Record<string, string> = {};
    if (currentPreset) p.preset = currentPreset.id;
    p.x = currentX;
    p.y = currentY;
    p.color = currentColor;
    if (selectedCats.length) p.cat = selectedCats.join(',');
    const qs = '?' + new URLSearchParams(p).toString();
    history.replaceState(null, '', `#/analysis${qs}`);
    saveState();
  }

  function effectiveCats(): string[] {
    if (selectedCats.length) return selectedCats;
    if (currentPreset && !currentPreset.categories.includes('all'))
      return currentPreset.categories;
    return allCats;
  }

  async function renderControls(): Promise<void> {
    const cats = effectiveCats();
    const validAxes = await getAxesForCategories(cats, query);

    // Fallback to first valid axis if current selection is not valid for the category
    if (!validAxes.find((a) => a.id === currentX)) {
      currentX = validAxes[0]?.id || 'price_anchor_usd';
    }
    if (!validAxes.find((a) => a.id === currentY)) {
      // Pick a different axis than X if possible
      const fallback = validAxes.find((a) => a.id !== currentX);
      currentY = fallback?.id || validAxes[0]?.id || 'price_anchor_usd';
    }

    controlsEl.innerHTML = `
      <div class="control-group">
        <label>${t('analysis.label.category')}</label>
        <select id="sel-cat" multiple size="${allCats.length}" style="min-width:140px">
          ${allCats.map((c) => `<option value="${c}" ${cats.includes(c) ? 'selected' : ''}>${getCategoryLabel(c)}</option>`).join('')}
        </select>
      </div>
      <div class="control-group">
        <label>${t('analysis.label.x_axis')}</label>
        <select id="sel-x">
          ${validAxes.map((a) => `<option value="${a.id}" ${a.id === currentX ? 'selected' : ''}>${getAxisLabel(a)}</option>`).join('')}
        </select>
        <span class="axis-desc" id="desc-x">${t('axisdesc.' + currentX)}</span>
      </div>
      <div class="control-group">
        <label>${t('analysis.label.y_axis')}</label>
        <select id="sel-y">
          ${validAxes.map((a) => `<option value="${a.id}" ${a.id === currentY ? 'selected' : ''}>${getAxisLabel(a)}</option>`).join('')}
        </select>
        <span class="axis-desc" id="desc-y">${t('axisdesc.' + currentY)}</span>
      </div>
      <div class="control-group">
        <label>${t('analysis.label.color')}</label>
        <select id="sel-color">
          <option value="category_primary" ${currentColor === 'category_primary' ? 'selected' : ''}>${t('analysis.color.category')}</option>
          <option value="brand_name_en" ${currentColor === 'brand_name_en' ? 'selected' : ''}>${t('analysis.color.brand')}</option>
        </select>
      </div>
    `;

    document.getElementById('sel-cat')!.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      selectedCats = Array.from(sel.selectedOptions).map((o) => o.value);
      currentPreset = undefined;
      syncUrl();
      renderControls();
      renderPresets();
      renderPlot();
    });
    document.getElementById('sel-x')!.addEventListener('change', (e) => {
      currentX = (e.target as HTMLSelectElement).value;
      document.getElementById('desc-x')!.textContent = t('axisdesc.' + currentX);
      currentPreset = undefined;
      syncUrl();
      renderPresets();
      renderPlot();
    });
    document.getElementById('sel-y')!.addEventListener('change', (e) => {
      currentY = (e.target as HTMLSelectElement).value;
      document.getElementById('desc-y')!.textContent = t('axisdesc.' + currentY);
      currentPreset = undefined;
      syncUrl();
      renderPresets();
      renderPlot();
    });
    document.getElementById('sel-color')!.addEventListener('change', (e) => {
      currentColor = (e.target as HTMLSelectElement).value;
      syncUrl();
      renderPlot();
    });
  }

  function renderPresets(): void {
    const cats = effectiveCats();
    const available = getPresetsForCategories(cats);
    presetsEl.innerHTML = available
      .map((p) => {
        const purpose = getPresetPurpose(p);
        return `
        <button class="preset-btn ${p.id === currentPreset?.id ? 'active' : ''}"
                data-preset="${p.id}" title="${purpose}">
          ${purpose}
        </button>`;
      })
      .join('');
    presetsEl.querySelectorAll('[data-preset]').forEach((el) => {
      el.addEventListener('click', async () => {
        const preset = PRESETS.find((p) => p.id === (el as HTMLElement).dataset.preset);
        if (!preset) return;
        currentPreset = preset;
        currentX = preset.x;
        currentY = preset.y;
        currentColor = preset.color;
        if (!preset.categories.includes('all')) {
          selectedCats = [...preset.categories];
        }
        syncUrl();
        await renderControls();
        renderPresets();
        renderPlot();
      });
    });
  }

  // Track row data per trace for context menu lookup
  // traceRows[traceIndex][pointIndex] → row data
  let traceRows: Array<typeof _rowType[]> = [];
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
  const _rowType: RowType = undefined as unknown as RowType;

  async function renderPlot(): Promise<void> {
    const xAxis = getAxis(currentX);
    const yAxis = getAxis(currentY);
    if (!xAxis || !yAxis) return;

    const cats = effectiveCats();
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

    // Show warning if few points
    if (rows.length < 10) {
      warningEl.innerHTML = `<div class="banner warning">${t('analysis.warning.few_points', { count: rows.length })}</div>`;
    } else if (rows.length < 20) {
      warningEl.innerHTML = `<div class="banner info">${t('analysis.info.limited', { count: rows.length })}</div>`;
    } else {
      warningEl.innerHTML = '';
    }

    // Group by color dimension
    const colorField = currentColor as 'category_primary' | 'brand_name_en';
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      let key: string;
      if (colorField === 'category_primary') key = row.category_primary;
      else key = row.brand_label || t('common.unknown');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // Limit brand colors to top N, rest as "Other"
    let traces: Data[];
    traceRows = [];
    if (colorField === 'brand_name_en' && groups.size > 15) {
      const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
      const top = sorted.slice(0, 12);
      const rest = sorted.slice(12).flatMap(([, v]) => v);
      traces = top.map(([name, data]) => { traceRows.push(data); return makeTrace(name, data, xAxis, yAxis); });
      if (rest.length) { traceRows.push(rest); traces.push(makeTrace('Other', rest, xAxis, yAxis, '#999')); }
    } else {
      traces = [...groups.entries()].map(([name, data]) => {
        traceRows.push(data);
        const color = colorField === 'category_primary' ? CATEGORY_COLORS[name] : undefined;
        return makeTrace(name, data, xAxis, yAxis, color);
      });
    }

    const xLabel = getAxisLabel(xAxis);
    const yLabel = getAxisLabel(yAxis);
    // Keep Plotly text (and label spacing) in sync with the app-wide font scale.
    // We treat the original base as 14px to derive the current scale.
    const baseFontPx = 14;
    const currentFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize || `${baseFontPx}`);
    const fontScale = Number.isFinite(currentFontPx) ? currentFontPx / baseFontPx : 1.25;

    const axisTitleFont = {
      family: 'Inter, sans-serif',
      size: 13 * fontScale,
      color: '#374151',
      weight: 600,
    };
    const layout: Partial<Layout> = {
      xaxis: {
        title: { text: xLabel, font: axisTitleFont, standoff: 10 * fontScale },
        type: xAxis.scale === 'log' ? 'log' : 'linear',
        gridcolor: '#eee',
        zerolinecolor: '#ddd',
      },
      yaxis: {
        title: { text: yLabel, font: axisTitleFont, standoff: 10 * fontScale },
        type: yAxis.scale === 'log' ? 'log' : 'linear',
        gridcolor: '#eee',
        zerolinecolor: '#ddd',
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
    };

    const config: Partial<Config> = {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      displaylogo: false,
    };

    await Plotly.react('scatter-plot', traces, layout, config);
  }

  // ── Context menu ──
  function dismissCtxMenu(): void {
    document.querySelector('.scatter-ctx-menu')?.remove();
  }

  function showCtxMenu(x: number, y: number, row: RowType): void {
    dismissCtxMenu();
    const menu = document.createElement('div');
    menu.className = 'scatter-ctx-menu';
    menu.innerHTML = `
      <button data-action="compare">${t('analysis.ctx.add_compare')}</button>
      <button data-action="google">${t('analysis.ctx.search_google')}</button>
      <button data-action="amazon">${t('analysis.ctx.search_amazon')}</button>
    `;
    // Position: keep within viewport
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;

    const searchQuery = `${row.brand_label} ${row.product_name}`.trim();

    menu.querySelector('[data-action="compare"]')!.addEventListener('click', () => {
      dismissCtxMenu();
      let ids: string[] = [];
      try {
        const raw = sessionStorage.getItem('compare_ids');
        ids = raw ? JSON.parse(raw) : [];
      } catch { /* empty */ }
      if (!ids.includes(row.product_id) && ids.length < 5) {
        ids.push(row.product_id);
        sessionStorage.setItem('compare_ids', JSON.stringify(ids));
        navigate('compare', { ids: ids.join(',') });
      }
    });

    menu.querySelector('[data-action="google"]')!.addEventListener('click', () => {
      dismissCtxMenu();
      window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, '_blank');
    });

    menu.querySelector('[data-action="amazon"]')!.addEventListener('click', () => {
      dismissCtxMenu();
      const amazonUrl = getLocale() === 'ja'
        ? `https://www.amazon.co.jp/s?k=${encodeURIComponent(searchQuery)}&tag=frieve02-22`
        : `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&tag=frieve-20`;
      window.open(amazonUrl, '_blank');
    });

    // Fetch and append source URLs for the displayed axes
    fetchSourceUrls(row.product_id, [currentX, currentY]).then((urls) => {
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
        try {
          a.textContent = new URL(url).hostname;
        } catch {
          a.textContent = url;
        }
        a.title = url;
        menu.appendChild(a);
      }
      // Re-adjust position after sources are added
      const newRect = menu.getBoundingClientRect();
      if (newRect.right > window.innerWidth) menu.style.left = `${window.innerWidth - newRect.width - 8}px`;
      if (newRect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - newRect.height - 8}px`;
    }).catch(() => { /* silently ignore source fetch errors */ });
  }

  // Resolve row from Plotly event point
  function getRowFromPoint(pt: { curveNumber: number; pointIndex: number }): RowType | undefined {
    return traceRows[pt.curveNumber]?.[pt.pointIndex];
  }

  // Right-click on plot points
  const plotEl = document.getElementById('scatter-plot')!;
  type HoverData = { curveNumber: number; pointIndex: number };
  type PlotlyEl = HTMLElement & { _hoverdata?: HoverData[] };

  plotEl.addEventListener('contextmenu', (e) => {
    // Only intercept if Plotly hover is active (a point is under cursor)
    const hovered = (plotEl as PlotlyEl)._hoverdata;
    if (hovered && hovered.length > 0) {
      e.preventDefault();
      const row = getRowFromPoint(hovered[0]);
      if (row) showCtxMenu(e.clientX, e.clientY, row);
    }
  });

  // Long-tap support for touch devices
  let longTapTimer: ReturnType<typeof setTimeout> | null = null;

  plotEl.addEventListener('touchstart', (e) => {
    longTapTimer = setTimeout(() => {
      const hovered = (plotEl as PlotlyEl)._hoverdata;
      if (hovered && hovered.length > 0) {
        const row = getRowFromPoint(hovered[0]);
        if (row) {
          e.preventDefault();
          const touch = e.changedTouches[0] || e.touches[0];
          showCtxMenu(touch.clientX, touch.clientY, row);
        }
      }
    }, 500);
  }, { passive: false });

  plotEl.addEventListener('touchend', () => {
    if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; }
  });
  plotEl.addEventListener('touchmove', () => {
    if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; }
  });

  // Dismiss on click/tap outside
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.scatter-ctx-menu')) dismissCtxMenu();
  });
  document.addEventListener('touchstart', (e) => {
    if (!(e.target as HTMLElement).closest('.scatter-ctx-menu')) dismissCtxMenu();
  });

  // Reset button — restore defaults and clear sessionStorage
  document.getElementById('analysis-reset')!.addEventListener('click', async () => {
    sessionStorage.removeItem(STORAGE_KEY);
    currentPreset = PRESETS.find((p) => p.id === 'msrp_vs_sinad');
    currentX = currentPreset?.x || 'price_anchor_usd';
    currentY = currentPreset?.y || 'perf_sinad_db';
    currentColor = currentPreset?.color || 'category_primary';
    selectedCats = [];
    syncUrl();
    await renderControls();
    renderPresets();
    await renderPlot();
  });

  await renderControls();
  renderPresets();
  syncUrl();
  await renderPlot();
}

interface AxisInfo {
  id: string;
  label: string;
  scale: string;
}

function makeTrace(
  name: string,
  data: Array<{
    x_val: number;
    y_val: number;
    brand_label: string;
    product_name: string;
    price_anchor_usd: number | null;
  }>,
  xAxis: AxisInfo,
  yAxis: AxisInfo,
  color?: string,
): Data {
  const xLabel = getAxisLabel(xAxis as import('../presets').AxisDef);
  const yLabel = getAxisLabel(yAxis as import('../presets').AxisDef);
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
