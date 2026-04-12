import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { query } from '../db/database';
import { PRESETS, getAxis, getAxesForCategories, getValidCategories, getPresetsForCategories, getCategoryLabel, getAxisLabel, getPresetPurpose, buildBetterAnnotations, computeParetoFrontier, clampForScatter, axisHasSourceVariants, axisMatchesDataSource, getAxisSourceKind, resolveAxisSource, validDataSourcesForAxis, isVariantAxisId, type Preset, type DataSource, type XDataSource, type YDataSource } from '../presets';
import { t, tAxisDesc, getLocale } from '../i18n';
import { navigate } from '../router';
import { fetchSourceUrls } from '../sources';
import { showToast } from '../toast';
import { attachClearable } from '../components/clearable-input';
import { MAX_COMPARE_PRODUCTS } from './compare';
import { chartColors } from '../theme';

const SOURCE_TYPE_COLORS: Record<string, string> = {
  spec: '#9333ea',
  measured: '#0891b2',
  unknown: '#94a3b8',
};

const SOURCE_TYPE_SYMBOLS: Record<string, string> = {
  spec: 'circle-open',
  measured: 'circle',
  unknown: 'x',
};

const CATEGORY_SYMBOLS: Record<string, string> = {
  headphone: 'circle',
  iem: 'diamond',
  dac: 'square',
  headphone_amp: 'triangle-up',
  speaker: 'pentagon',
  speaker_amp: 'star',
  mic: 'cross',
  usb_interface: 'hexagon',
};

const BRAND_SYMBOL_CYCLE = [
  'circle', 'square', 'diamond', 'triangle-up', 'cross',
  'star', 'pentagon', 'hexagon', 'triangle-down', 'x',
  'star-square', 'hourglass',
];

/** Format a number for tooltip display: 3 significant digits, but year axes stay as 4-digit integers */
function fmtAxis(v: number, axis: { id?: string; scale: string }): string {
  if (axis.scale === 'year') return Math.round(v).toString();
  if (v === 0 && axis.id && /(^|_)(amp|line)_output_impedance_ohm(_measured|_spec)?$/.test(axis.id)) return '≈0';
  if (v === 0) return '0';
  if (axis.id === 'weight_g' && v > 1000) {
    return parseFloat((v / 1000).toPrecision(3)).toString() + ' kg';
  }
  if (axis.id && /^freq_(low|high)_hz(_measured|_spec)?$/.test(axis.id) && v >= 1000) {
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

let analysisResizeObserver: ResizeObserver | null = null;

function getInteractionHint(): string {
  const mm = (q: string): boolean => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const caps = {
    primaryFine: mm('(pointer: fine)'),
    primaryCoarse: mm('(pointer: coarse)'),
    anyFine: mm('(any-pointer: fine)'),
    anyHover: mm('(any-hover: hover)'),
    hasTouch: mm('(any-pointer: coarse)') || 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0,
  };
  if (caps.primaryFine && caps.anyHover) {
    return t('analysis.hint.mouse');
  } else if (caps.primaryCoarse && caps.hasTouch) {
    return t('analysis.hint.touch');
  } else if (caps.hasTouch && caps.anyFine) {
    return t('analysis.hint.hybrid');
  }
  return t('analysis.hint.hybrid');
}

export async function renderAnalysis(
  container: HTMLElement,
  params: URLSearchParams,
): Promise<void> {
  const STORAGE_KEY = 'analysis_state';
  const UI_MODE_KEY = 'analysis_ui_mode';

  type UiMode = 'basic' | 'advanced';
  function loadUiMode(): UiMode {
    try {
      const v = localStorage.getItem(UI_MODE_KEY);
      return v === 'advanced' ? 'advanced' : 'basic';
    } catch {
      return 'basic';
    }
  }
  function saveUiMode(mode: UiMode): void {
    try { localStorage.setItem(UI_MODE_KEY, mode); } catch { /* ignore */ }
  }
  let uiMode: UiMode = loadUiMode();

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
      symbol: currentSymbol,
      xSource: currentXDataSource,
      ySource: currentYDataSource,
    };
    if (selectedCats.length) s.cat = selectedCats.join(',');
    if (currentKeyword) s.keyword = currentKeyword;
    if (currentLabels) s.labels = '1';
    if (currentLabelsPareto) s.labelsPareto = '1';
    if (!currentShowCorrelation) s.showCorrelation = '0';
    if (!currentShowPareto) s.showPareto = '0';
    if (!currentShowBetter) s.showBetter = '0';
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  // Merge: URL params > sessionStorage > defaults
  // If URL has explicit params, use only URL values (don't mix with stale session state)
  const hasUrlParams = params.toString().length > 0;
  const stored = hasUrlParams ? {} as Record<string, string> : loadStoredState();
  const presetId = params.get('preset') || stored.preset || 'msrp_vs_sinad';
  const catParam = params.get('cat') || stored.cat || '';
  const keywordParam = params.get('keyword') || stored.keyword || '';

  container.innerHTML = `
    <div class="view-header">
      <h1>${t('analysis.title')}</h1>
      <p>${t('analysis.subtitle')}</p>
    </div>
    <div class="analysis-mode-bar" id="analysis-mode-bar" style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
      <button type="button" id="mode-basic" class="mode-btn${uiMode === 'basic' ? ' active' : ''}">${t('analysis.mode.basic')}</button>
      <button type="button" id="mode-advanced" class="mode-btn${uiMode === 'advanced' ? ' active' : ''}">${t('analysis.mode.advanced')}</button>
    </div>
    <div class="controls-bar" id="analysis-controls"></div>
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">
      <div id="analysis-presets" class="preset-bar" style="flex:1;margin-bottom:0"></div>
      <button id="analysis-reset" class="danger">${t('common.reset')}</button>
    </div>
    <div id="analysis-warning"></div>
    <div id="analysis-interaction-hint" class="interaction-hint">${getInteractionHint()}</div>
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
  let currentY = params.get('y') || stored.y || currentPreset?.y || 'sinad_db';
  let currentColor = params.get('color') || stored.color || currentPreset?.color || 'category_primary';
  let currentSymbol = params.get('symbol') || stored.symbol || 'none';
  const allXDataSources: XDataSource[] = ['best', 'spec', 'measured'];
  const allYDataSources: YDataSource[] = ['best', 'both', 'spec', 'measured'];
  // Back-compat: accept legacy `dataSource` param as a shared default.
  const legacyDs = params.get('dataSource') || stored.dataSource || '';
  const xSourceParam = (params.get('xSource') || stored.xSource || legacyDs || 'best') as XDataSource;
  const ySourceParam = (params.get('ySource') || stored.ySource || legacyDs || 'best') as YDataSource;
  let currentXDataSource: XDataSource = allXDataSources.includes(xSourceParam) ? xSourceParam : 'best';
  let currentYDataSource: YDataSource = allYDataSources.includes(ySourceParam) ? ySourceParam : 'best';
  let currentKeyword = keywordParam;
  let currentLabels = (params.get('labels') || stored.labels || '') === '1';
  let currentLabelsPareto = (params.get('labelsPareto') || stored.labelsPareto || '') === '1';
  let currentShowCorrelation = (params.get('showCorrelation') || stored.showCorrelation || '1') !== '0';
  let currentShowPareto = (params.get('showPareto') || stored.showPareto || '1') !== '0';
  let currentShowBetter = (params.get('showBetter') || stored.showBetter || '1') !== '0';

  function syncUrl(): void {
    const p: Record<string, string> = {};
    if (currentPreset) p.preset = currentPreset.id;
    p.x = currentX;
    p.y = currentY;
    p.color = currentColor;
    if (currentSymbol && currentSymbol !== 'none') p.symbol = currentSymbol;
    if (currentXDataSource !== 'best') p.xSource = currentXDataSource;
    if (currentYDataSource !== 'best') p.ySource = currentYDataSource;
    if (selectedCats.length) p.cat = selectedCats.join(',');
    if (currentKeyword) p.keyword = currentKeyword;
    if (currentLabels) p.labels = '1';
    if (currentLabelsPareto) p.labelsPareto = '1';
    if (!currentShowCorrelation) p.showCorrelation = '0';
    if (!currentShowPareto) p.showPareto = '0';
    if (!currentShowBetter) p.showBetter = '0';
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
    const allValidAxes = await getAxesForCategories(cats, query);
    // Exclude variant (_measured / _spec) axes — users pick the data source
    // via a separate per-axis control. Filter each axis dropdown by the
    // current data source for that axis (e.g. SINAD is measured-only, so it
    // should not appear in a dropdown whose source is 'spec').
    const nonVariant = allValidAxes.filter((a) => !isVariantAxisId(a.id));
    const validXAxes = nonVariant.filter(
      (a) => axisMatchesDataSource(a.id, currentXDataSource),
    );
    const validYAxes = nonVariant.filter(
      (a) => axisMatchesDataSource(a.id, currentYDataSource),
    );

    // If current selection is a variant axis, collapse it to its base id.
    const toBase = (id: string): string => id.replace(/_(measured|spec)$/, '');
    currentX = toBase(currentX);
    currentY = toBase(currentY);

    // Keep the current selection in its dropdown even if it falls below the
    // min-data threshold for the current category/data-source — the user has
    // explicitly chosen it, and we show a "no data" message instead of
    // silently falling back to another axis.
    const ensureAxisVisible = (list: typeof validXAxes, id: string): void => {
      if (list.find((a) => a.id === id)) return;
      const a = getAxis(id);
      if (a) list.push(a);
    };
    ensureAxisVisible(validXAxes, currentX);
    ensureAxisVisible(validYAxes, currentY);

    // Clamp the current data sources to what the currently selected axis supports.
    const xDsOptions = validDataSourcesForAxis(currentX, false) as XDataSource[];
    const yDsOptions = validDataSourcesForAxis(currentY, true) as YDataSource[];
    if (!xDsOptions.includes(currentXDataSource)) currentXDataSource = 'best';
    if (!yDsOptions.includes(currentYDataSource)) currentYDataSource = 'best';

    const dsLabel = (ds: DataSource): string => t('analysis.data_source.' + ds);

    const isAdvanced = uiMode === 'advanced';
    controlsEl.innerHTML = `
      <div class="control-group">
        <label>${t('analysis.label.category')}</label>
        <select id="sel-cat" multiple size="${allCats.length}" style="min-width:140px">
          ${allCats.map((c) => `<option value="${c}" ${cats.includes(c) ? 'selected' : ''}>${getCategoryLabel(c)}</option>`).join('')}
        </select>
      </div>
      <div class="control-group">
        <label>${t('analysis.label.keyword')}</label>
        <input type="text" id="input-keyword" value="${currentKeyword.replace(/"/g, '&quot;')}"
               placeholder="${t('analysis.label.keyword_placeholder')}"
               style="min-width:260px">
      </div>
      <div class="control-group">
        <label>${t('analysis.label.x_axis')}</label>
        <select id="sel-x">
          ${validXAxes.map((a) => `<option value="${a.id}" ${a.id === currentX ? 'selected' : ''}>${getAxisLabel(a)}</option>`).join('')}
        </select>
        <span class="axis-desc" id="desc-x">${tAxisDesc(currentX)}</span>
      </div>
      ${isAdvanced ? `<div class="control-group">
        <label>${t('analysis.label.x_data_source')}</label>
        <select id="sel-x-data-source" ${xDsOptions.length <= 1 ? 'disabled' : ''}>
          ${xDsOptions.map((ds) => `<option value="${ds}" ${ds === currentXDataSource ? 'selected' : ''}>${dsLabel(ds)}</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="control-group">
        <label>${t('analysis.label.y_axis')}</label>
        <select id="sel-y">
          ${validYAxes.map((a) => `<option value="${a.id}" ${a.id === currentY ? 'selected' : ''}>${getAxisLabel(a)}</option>`).join('')}
        </select>
        <span class="axis-desc" id="desc-y">${tAxisDesc(currentY)}</span>
      </div>
      ${isAdvanced ? `<div class="control-group">
        <label>${t('analysis.label.y_data_source')}</label>
        <select id="sel-y-data-source" ${yDsOptions.length <= 1 ? 'disabled' : ''}>
          ${yDsOptions.map((ds) => `<option value="${ds}" ${ds === currentYDataSource ? 'selected' : ''}>${dsLabel(ds)}</option>`).join('')}
        </select>
      </div>
      <div class="control-group">
        <label>${t('analysis.label.color')}</label>
        <select id="sel-color">
          <option value="category_primary" ${currentColor === 'category_primary' ? 'selected' : ''}>${t('analysis.color.category')}</option>
          <option value="brand_name_en" ${currentColor === 'brand_name_en' ? 'selected' : ''}>${t('analysis.color.brand')}</option>
          <option value="source_type" ${currentColor === 'source_type' ? 'selected' : ''}>${t('analysis.color.source_type')}</option>
        </select>
      </div>
      <div class="control-group">
        <label>${t('analysis.label.symbol')}</label>
        <select id="sel-symbol">
          <option value="none" ${currentSymbol === 'none' ? 'selected' : ''}>${t('analysis.symbol.none')}</option>
          <option value="category_primary" ${currentSymbol === 'category_primary' ? 'selected' : ''}>${t('analysis.color.category')}</option>
          <option value="brand_name_en" ${currentSymbol === 'brand_name_en' ? 'selected' : ''}>${t('analysis.color.brand')}</option>
          <option value="source_type" ${currentSymbol === 'source_type' ? 'selected' : ''}>${t('analysis.color.source_type')}</option>
        </select>
      </div>
      <div class="controls-break"></div>
      <div class="control-group">
        <label>${t('analysis.label.labels')}</label>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="chk-labels" ${currentLabels ? 'checked' : ''}>
            ${t('analysis.label.show_labels')}
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="chk-labels-pareto" ${currentLabelsPareto ? 'checked' : ''}${currentLabels ? '' : ' disabled'}>
            ${t('analysis.label.labels_pareto_only')}
          </label>
        </div>
      </div>
      <div class="control-group">
        <label>${t('analysis.label.option')}</label>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" id="chk-show-correlation" ${currentShowCorrelation ? 'checked' : ''}>
            ${t('analysis.label.show_correlation')}
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="chk-show-pareto" ${currentShowPareto ? 'checked' : ''}>
            ${t('analysis.label.show_pareto')}
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="chk-show-better" ${currentShowBetter ? 'checked' : ''}>
            ${t('analysis.label.show_better')}
          </label>
        </div>
      </div>` : ''}
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
    document.getElementById('sel-x')!.addEventListener('change', async (e) => {
      currentX = (e.target as HTMLSelectElement).value;
      currentPreset = undefined;
      syncUrl();
      // Rebuild controls so the X data-source dropdown reflects the new axis kind.
      await renderControls();
      renderPresets();
      renderPlot();
    });
    document.getElementById('sel-y')!.addEventListener('change', async (e) => {
      currentY = (e.target as HTMLSelectElement).value;
      currentPreset = undefined;
      syncUrl();
      // Rebuild controls so the Y data-source dropdown reflects the new axis kind.
      await renderControls();
      renderPresets();
      renderPlot();
    });
    document.getElementById('sel-x-data-source')?.addEventListener('change', async (e) => {
      currentXDataSource = (e.target as HTMLSelectElement).value as XDataSource;
      if (currentPreset && !axisMatchesDataSource(currentPreset.x, currentXDataSource)) {
        currentPreset = undefined;
      }
      syncUrl();
      await renderControls();
      renderPresets();
      renderPlot();
    });
    document.getElementById('sel-y-data-source')?.addEventListener('change', async (e) => {
      currentYDataSource = (e.target as HTMLSelectElement).value as YDataSource;
      if (currentPreset && !axisMatchesDataSource(currentPreset.y, currentYDataSource)) {
        currentPreset = undefined;
      }
      syncUrl();
      await renderControls();
      renderPresets();
      renderPlot();
    });
    document.getElementById('sel-color')?.addEventListener('change', (e) => {
      currentColor = (e.target as HTMLSelectElement).value;
      syncUrl();
      renderPlot();
    });
    document.getElementById('sel-symbol')?.addEventListener('change', (e) => {
      currentSymbol = (e.target as HTMLSelectElement).value;
      syncUrl();
      renderPlot();
    });

    let keywordTimer: ReturnType<typeof setTimeout> | null = null;
    const keywordInput = document.getElementById('input-keyword') as HTMLInputElement;
    keywordInput.addEventListener('input', (e) => {
      if (keywordTimer) clearTimeout(keywordTimer);
      keywordTimer = setTimeout(() => {
        currentKeyword = (e.target as HTMLInputElement).value.trim();
        syncUrl();
        renderPlot();
      }, 300);
    });
    attachClearable(keywordInput);

    document.getElementById('chk-show-correlation')?.addEventListener('change', (e) => {
      currentShowCorrelation = (e.target as HTMLInputElement).checked;
      syncUrl();
      renderPlot();
    });

    document.getElementById('chk-show-pareto')?.addEventListener('change', (e) => {
      currentShowPareto = (e.target as HTMLInputElement).checked;
      syncUrl();
      renderPlot();
    });

    document.getElementById('chk-show-better')?.addEventListener('change', (e) => {
      currentShowBetter = (e.target as HTMLInputElement).checked;
      syncUrl();
      renderPlot();
    });

    document.getElementById('chk-labels')?.addEventListener('change', (e) => {
      currentLabels = (e.target as HTMLInputElement).checked;
      const paretoChk = document.getElementById('chk-labels-pareto') as HTMLInputElement;
      paretoChk.disabled = !currentLabels;
      syncUrl();
      renderPlot();
    });

    document.getElementById('chk-labels-pareto')?.addEventListener('change', (e) => {
      currentLabelsPareto = (e.target as HTMLInputElement).checked;
      syncUrl();
      renderPlot();
    });
  }

  function renderPresets(): void {
    const cats = effectiveCats();
    const available = getPresetsForCategories(cats).filter(
      (p) => axisMatchesDataSource(p.x, currentXDataSource)
        && axisMatchesDataSource(p.y, currentYDataSource),
    );
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
        } else {
          selectedCats = [];
        }
        // Reset advanced settings so the preset shows as intended, rather
        // than inheriting stale overrides from a previous preset/session.
        currentSymbol = 'none';
        currentXDataSource = 'best';
        currentYDataSource = 'best';
        currentKeyword = '';
        currentLabels = false;
        currentLabelsPareto = false;
        currentShowCorrelation = true;
        currentShowPareto = true;
        currentShowBetter = true;
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
    x_val_raw: number;
    y_val_raw: number;
    brand_name_en: string;
    price_anchor_usd: number | null;
    source_type: string;
    x_src: string;
    y_src: string;
  };
  const _rowType: RowType = undefined as unknown as RowType;

  async function renderPlot(): Promise<void> {
    const xAxis = getAxis(currentX);
    const yAxis = getAxis(currentY);
    if (!xAxis || !yAxis) return;

    const cats = effectiveCats();
    const catPlaceholders = cats.map(() => '?').join(',');

    // Resolve per-axis source expressions honoring the data-source setting.
    // Only Y axis supports 'both' (UNION across spec/measured branches).
    const xSource = resolveAxisSource(currentX, currentXDataSource);
    const ySourceResolved = currentYDataSource === 'both'
      ? resolveAxisSource(currentY, 'best') // placeholder; actual per-branch below
      : resolveAxisSource(currentY, currentYDataSource);
    const yHasVariants = axisHasSourceVariants(currentY);
    const useBoth = currentYDataSource === 'both' && yHasVariants;

    const xKind = getAxisSourceKind(currentX);
    const yKind = getAxisSourceKind(currentY);

    // Per-axis source-type literal columns used for hover display and coloring.
    // 'meta' for non-variant-capable axes (price/year/etc.), explicit for
    // spec/measured, or CASE-derived for best mode on multi-source axes.
    function xSrcLiteralExpr(): string {
      if (xKind === 'meta') return "'meta' as x_src";
      if (currentXDataSource === 'spec') return "'spec' as x_src";
      if (currentXDataSource === 'measured') return "'measured' as x_src";
      // best mode
      if (xKind === 'multi') {
        return `CASE
          WHEN p.${currentX}_measured IS NOT NULL THEN 'measured'
          WHEN p.${currentX}_spec     IS NOT NULL THEN 'spec'
          ELSE 'unknown'
        END as x_src`;
      }
      // fixed measured/spec kind with best mode
      return `'${xKind}' as x_src`;
    }
    function ySrcLiteralExpr(fixed?: 'spec' | 'measured'): string {
      if (fixed) return `'${fixed}' as y_src`;
      if (yKind === 'meta') return "'meta' as y_src";
      if (currentYDataSource === 'spec') return "'spec' as y_src";
      if (currentYDataSource === 'measured') return "'measured' as y_src";
      if (currentYDataSource === 'best') {
        if (yKind === 'multi') {
          return `CASE
            WHEN p.${currentY}_measured IS NOT NULL THEN 'measured'
            WHEN p.${currentY}_spec     IS NOT NULL THEN 'spec'
            ELSE 'unknown'
          END as y_src`;
        }
        return `'${yKind}' as y_src`;
      }
      // 'both' — caller supplies the branch literal via `fixed`
      return "'unknown' as y_src";
    }

    // Legacy `source_type` column (used by color/symbol grouping) — prefer
    // y_src when Y is a variant-capable axis, otherwise fall back to x_src.
    function sourceTypeExpr(yOverride?: 'spec' | 'measured'): string {
      const y = yOverride ? `'${yOverride}'` : (yKind === 'meta' ? 'NULL' : ySrcColumn(yOverride));
      const x = xKind === 'meta' ? 'NULL' : xSrcColumn();
      return `coalesce(${y}, ${x}, 'unknown') as source_type`;
    }
    function xSrcColumn(): string {
      if (xKind === 'meta') return 'NULL';
      if (currentXDataSource === 'spec') return "'spec'";
      if (currentXDataSource === 'measured') return "'measured'";
      if (xKind === 'multi') {
        return `CASE
          WHEN p.${currentX}_measured IS NOT NULL THEN 'measured'
          WHEN p.${currentX}_spec     IS NOT NULL THEN 'spec'
          ELSE NULL
        END`;
      }
      return `'${xKind}'`;
    }
    function ySrcColumn(yOverride?: 'spec' | 'measured'): string {
      if (yOverride) return `'${yOverride}'`;
      if (yKind === 'meta') return 'NULL';
      if (currentYDataSource === 'spec') return "'spec'";
      if (currentYDataSource === 'measured') return "'measured'";
      if (currentYDataSource === 'best' && yKind === 'multi') {
        return `CASE
          WHEN p.${currentY}_measured IS NOT NULL THEN 'measured'
          WHEN p.${currentY}_spec     IS NOT NULL THEN 'spec'
          ELSE NULL
        END`;
      }
      if (currentYDataSource === 'best') return `'${yKind}'`;
      return 'NULL';
    }

    const buildBranchSql = (
      xSrc: string,
      ySrc: string,
      yOverride?: 'spec' | 'measured',
    ): string => `
      SELECT
        p.product_id,
        CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END as brand_label,
        p.product_name,
        p.category_primary,
        ${xSrc} as x_val,
        ${ySrc} as y_val,
        p.brand_name_en,
        coalesce(p.street_price_usd, p.msrp_usd) as price_anchor_usd,
        ${xSrcLiteralExpr()},
        ${ySrcLiteralExpr(yOverride)},
        ${sourceTypeExpr(yOverride)}
      FROM web_product_core p
      WHERE p.category_primary IN (${catPlaceholders})
        AND (${xSrc}) IS NOT NULL
        AND (${ySrc}) IS NOT NULL
    `;

    let sql: string;
    let sqlParams: unknown[];
    if (useBoth) {
      const ySpec = resolveAxisSource(currentY, 'spec');
      const yMeas = resolveAxisSource(currentY, 'measured');
      sql = `${buildBranchSql(xSource, ySpec, 'spec')}
        UNION ALL
        ${buildBranchSql(xSource, yMeas, 'measured')}`;
      sqlParams = [...cats, ...cats];
    } else {
      sql = buildBranchSql(xSource, ySourceResolved);
      sqlParams = [...cats];
    }

    let rows = clampForScatter(await query<RowType>(sql, sqlParams), currentX, currentY);

    // Filter by keyword if set
    if (currentKeyword) {
      const kw = currentKeyword.toLowerCase();
      rows = rows.filter((r) =>
        r.brand_label.toLowerCase().includes(kw) ||
        r.product_name.toLowerCase().includes(kw),
      );
    }

    // Show warning if few points (or none)
    if (rows.length === 0) {
      warningEl.innerHTML = `<div class="banner warning">${t('analysis.warning.no_points')}</div>`;
      Plotly.purge('scatter-plot');
      traceRows = [];
      return;
    } else if (rows.length < 10) {
      warningEl.innerHTML = `<div class="banner warning">${t('analysis.warning.few_points', { count: rows.length })}</div>`;
    } else if (rows.length < 20) {
      warningEl.innerHTML = `<div class="banner info">${t('analysis.info.limited', { count: rows.length })}</div>`;
    } else {
      warningEl.innerHTML = '';
    }

    // Resolve grouping key for a row given a dimension field
    type DimField = 'category_primary' | 'brand_name_en' | 'source_type' | 'none';
    function dimKey(row: RowType, field: DimField): string {
      if (field === 'category_primary') return row.category_primary;
      if (field === 'brand_name_en') return row.brand_label || t('common.unknown');
      if (field === 'source_type') return row.source_type || 'unknown';
      return 'all';
    }
    function dimLabel(key: string, field: DimField): string {
      if (field === 'category_primary') return getCategoryLabel(key);
      if (field === 'source_type') return t('analysis.source_type.' + key);
      return key;
    }

    const colorField = currentColor as DimField;
    const symbolField = currentSymbol as DimField;
    const sameField = colorField === symbolField && symbolField !== 'none';

    // First-level color groups
    const colorGroups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = dimKey(row, colorField);
      if (!colorGroups.has(key)) colorGroups.set(key, []);
      colorGroups.get(key)!.push(row);
    }

    // Limit brand colors to top N — rest go into "Other" bucket
    let limitedColorGroups: Array<[string, RowType[]]>;
    let otherRows: RowType[] = [];
    if (colorField === 'brand_name_en' && colorGroups.size > 15) {
      const sorted = [...colorGroups.entries()].sort((a, b) => b[1].length - a[1].length);
      limitedColorGroups = sorted.slice(0, 12);
      otherRows = sorted.slice(12).flatMap(([, v]) => v);
    } else {
      limitedColorGroups = [...colorGroups.entries()];
    }

    // Plotly default colorway — used to explicitly assign colors to brand
    // traces so that connecting lines (useBoth mode) can match marker color.
    const PLOTLY_DEFAULT_COLORS = [
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
    ];

    // Resolve color & symbol for a key
    function resolveColor(key: string, isOther = false): string | undefined {
      if (isOther) return '#999';
      if (colorField === 'category_primary') return CATEGORY_COLORS[key];
      if (colorField === 'source_type') return SOURCE_TYPE_COLORS[key];
      return undefined; // brand → let plotly auto-color
    }

    // Build an explicit color-group → color map. For brand mode (auto-coloring)
    // we assign from the default Plotly colorway in color-group order so that
    // matching line traces can reuse the exact same color.
    const colorGroupColorMap = new Map<string, string>();
    {
      let brandColorIdx = 0;
      for (const [colorKey] of limitedColorGroups) {
        const c = resolveColor(colorKey);
        if (c) {
          colorGroupColorMap.set(colorKey, c);
        } else {
          colorGroupColorMap.set(
            colorKey,
            PLOTLY_DEFAULT_COLORS[brandColorIdx % PLOTLY_DEFAULT_COLORS.length],
          );
          brandColorIdx++;
        }
      }
      if (otherRows.length) colorGroupColorMap.set('__other__', '#999');
    }
    // For brand symbols, build a stable key→symbol map by brand frequency order
    const brandSymbolMap = new Map<string, string>();
    if (symbolField === 'brand_name_en') {
      const brands = [...new Set(rows.map((r) => r.brand_label || t('common.unknown')))];
      brands.forEach((b, i) => brandSymbolMap.set(b, BRAND_SYMBOL_CYCLE[i % BRAND_SYMBOL_CYCLE.length]));
    }
    function resolveSymbol(key: string): string | undefined {
      if (symbolField === 'none') return undefined;
      if (symbolField === 'category_primary') return CATEGORY_SYMBOLS[key] || 'circle';
      if (symbolField === 'source_type') return SOURCE_TYPE_SYMBOLS[key] || 'x';
      if (symbolField === 'brand_name_en') return brandSymbolMap.get(key) || 'circle';
      return undefined;
    }

    // Compute Pareto frontier (used for both the frontier line and pareto-only labels)
    const pareto = computeParetoFrontier(rows, xAxis, yAxis);
    const paretoSet: Set<string> | null = (currentLabels && currentLabelsPareto && pareto)
      ? new Set(pareto.map((p) => `${p.x},${p.y}`))
      : null;

    // Build traces by (color, symbol) pairs
    const traces: Data[] = [];
    traceRows = [];
    const xAxisDef = xAxis;
    const yAxisDef = yAxis;

    function emitTraces(colorKey: string, data: RowType[], isOther: boolean): void {
      const color = isOther
        ? '#999'
        : (colorGroupColorMap.get(colorKey) ?? resolveColor(colorKey, isOther));
      const colorDisplay = isOther ? 'Other' : dimLabel(colorKey, colorField);

      if (symbolField === 'none' || sameField) {
        // No symbol grouping (or same field as color → identical groups)
        const symbol = sameField ? resolveSymbol(colorKey) : undefined;
        traceRows.push(data);
        traces.push(makeTrace(colorDisplay, data, xAxisDef, yAxisDef, color, currentLabels, paretoSet, symbol));
        return;
      }

      // Sub-group by symbol field
      const subGroups = new Map<string, RowType[]>();
      for (const row of data) {
        const k = dimKey(row, symbolField);
        if (!subGroups.has(k)) subGroups.set(k, []);
        subGroups.get(k)!.push(row);
      }
      for (const [symKey, subData] of subGroups) {
        const symbol = resolveSymbol(symKey);
        const symDisplay = dimLabel(symKey, symbolField);
        const name = `${colorDisplay} – ${symDisplay}`;
        traceRows.push(subData);
        traces.push(makeTrace(name, subData, xAxisDef, yAxisDef, color, currentLabels, paretoSet, symbol));
      }
    }

    for (const [colorKey, data] of limitedColorGroups) {
      emitTraces(colorKey, data, false);
    }
    if (otherRows.length) {
      emitTraces('__other__', otherRows, true);
    }

    // Cap total legend entries: when color × symbol produces too many traces,
    // the horizontal legend grows unboundedly downward. Merge the smallest
    // traces into a single grey "Other" bucket once we exceed the cap.
    const MAX_LEGEND_TRACES = 16;
    if (traces.length > MAX_LEGEND_TRACES) {
      const indexed = traces.map((tr, i) => ({ tr, rows: traceRows[i], idx: i }));
      indexed.sort((a, b) => b.rows.length - a.rows.length);
      const keep = indexed.slice(0, MAX_LEGEND_TRACES - 1).sort((a, b) => a.idx - b.idx);
      const merge = indexed.slice(MAX_LEGEND_TRACES - 1);
      const mergedRows = merge.flatMap((m) => m.rows);
      traces.length = 0;
      traceRows = [];
      for (const { tr, rows: r } of keep) {
        traces.push(tr);
        traceRows.push(r);
      }
      traces.push(makeTrace('Other', mergedRows, xAxisDef, yAxisDef, '#999', currentLabels, paretoSet));
      traceRows.push(mergedRows);
    }

    // When Y axis shows both manufacturer spec and third-party measured values,
    // draw a connecting line between the two points for each product that has
    // both. The line uses the same color as the color group's markers so the
    // pairing is visually unambiguous.
    if (useBoth) {
      const colorGroupsForLines: Array<[string, RowType[]]> = [
        ...limitedColorGroups,
        ...(otherRows.length ? [['__other__', otherRows] as [string, RowType[]]] : []),
      ];
      // Insert in reverse so final order matches colorGroupsForLines, and all
      // line traces end up below the marker traces (drawn first → behind).
      for (let i = colorGroupsForLines.length - 1; i >= 0; i--) {
        const [colorKey, groupRows] = colorGroupsForLines[i];
        const byPid = new Map<string, RowType[]>();
        for (const r of groupRows) {
          if (!byPid.has(r.product_id)) byPid.set(r.product_id, []);
          byPid.get(r.product_id)!.push(r);
        }
        const xs: (number | null)[] = [];
        const ys: (number | null)[] = [];
        for (const group of byPid.values()) {
          if (group.length < 2) continue;
          const spec = group.find((r) => r.y_src === 'spec');
          const meas = group.find((r) => r.y_src === 'measured');
          if (!spec || !meas) continue;
          xs.push(spec.x_val, meas.x_val, null);
          ys.push(spec.y_val, meas.y_val, null);
        }
        if (xs.length === 0) continue;
        const lineColor = colorGroupColorMap.get(colorKey) || '#888';
        traces.unshift({
          x: xs,
          y: ys,
          mode: 'lines',
          type: 'scatter',
          line: { color: lineColor, width: 1 },
          opacity: 0.6,
          showlegend: false,
          hoverinfo: 'skip',
          connectgaps: false,
        } as Data);
        traceRows.unshift([]);
      }
    }

    if (pareto && currentShowPareto) {
      traces.unshift({
        x: pareto.map((p) => p.x),
        y: pareto.map((p) => p.y),
        mode: 'lines',
        type: 'scatter',
        name: 'Pareto',
        line: { color: 'rgba(180,180,180,0.45)', width: 2, dash: 'dot' },
        hoverinfo: 'skip',
        showlegend: false,
      } as Data);
      // Shift traceRows indices to match (insert empty entry at front)
      traceRows.unshift([]);
    }

    // Identity (y=x) diagonal when X and Y are the same base metric with
    // different data sources (e.g., manufacturer spec vs third-party measured).
    // Lets the user visually gauge how closely measurements match published specs.
    const isIdentityComparison =
      currentX === currentY
      && (currentXDataSource === 'spec' || currentXDataSource === 'measured')
      && (currentYDataSource === 'spec' || currentYDataSource === 'measured')
      && currentXDataSource !== currentYDataSource;
    if (isIdentityComparison && rows.length >= 2) {
      const all = rows.flatMap((r) => [r.x_val, r.y_val]);
      const values = xAxis.scale === 'log' ? all.filter((v) => v > 0) : all;
      if (values.length >= 2) {
        const lo = Math.min(...values);
        const hi = Math.max(...values);
        if (lo < hi) {
          traces.unshift({
            x: [lo, hi],
            y: [lo, hi],
            mode: 'lines',
            type: 'scatter',
            name: 'y = x',
            line: { color: 'rgba(120,120,180,0.55)', width: 2, dash: 'dash' },
            hoverinfo: 'skip',
            showlegend: false,
          } as Data);
          traceRows.unshift([]);
        }
      }
    }

    // Append the data-source label (manufacturer spec / third-party measured)
    // to the axis title when the user has locked the axis to a specific source.
    // Only meaningful for axes that actually have a source-type concept.
    const axisLabelWithSource = (
      axis: typeof xAxis,
      baseId: string,
      ds: DataSource,
    ): string => {
      const base = getAxisLabel(axis);
      if (ds !== 'spec' && ds !== 'measured') return base;
      if (getAxisSourceKind(baseId) === 'meta') return base;
      return `${base} (${t('analysis.source_type.' + ds)})`;
    };
    const xLabel = axisLabelWithSource(xAxis, currentX, currentXDataSource);
    const yLabel = axisLabelWithSource(yAxis, currentY, currentYDataSource);
    // Keep Plotly text (and label spacing) in sync with the app-wide font scale.
    // We treat the original base as 14px to derive the current scale.
    const baseFontPx = 14;
    const currentFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize || `${baseFontPx}`);
    const fontScale = Number.isFinite(currentFontPx) ? currentFontPx / baseFontPx : 1.25;

    function narrowLayout(n: boolean) {
      return {
        xStandoff: (n ? 4 : 10) * fontScale,
        yStandoff: (n ? 2 : 10) * fontScale,
        margin: {
          l: (n ? 40 : 70) * fontScale,
          r: (n ? 8 : 20) * fontScale,
          t: 20 * fontScale,
          b: (n ? 40 : 55) * fontScale,
        },
      };
    }

    let wasNarrow = window.innerWidth <= 540;
    const nl = narrowLayout(wasNarrow);

    const cc = chartColors();
    const axisTitleFont = {
      family: 'Inter, sans-serif',
      size: 13 * fontScale,
      color: cc.axisTitleColor,
      weight: 600,
    };

    const layout: Partial<Layout> = {
      xaxis: {
        title: { text: xLabel, font: axisTitleFont, standoff: nl.xStandoff },
        type: xAxis.scale === 'log' ? 'log' : 'linear',
        gridcolor: cc.gridcolor,
        zerolinecolor: cc.zerolinecolor,
      },
      yaxis: {
        title: { text: yLabel, font: axisTitleFont, standoff: nl.yStandoff },
        type: yAxis.scale === 'log' ? 'log' : 'linear',
        gridcolor: cc.gridcolor,
        zerolinecolor: cc.zerolinecolor,
      },
      paper_bgcolor: cc.paper_bgcolor,
      plot_bgcolor: cc.plot_bgcolor,
      font: { family: 'Inter, sans-serif', size: 12 * fontScale, ...(cc.fontColor ? { color: cc.fontColor } : {}) },
      margin: nl.margin,
      legend: {
        orientation: 'h',
        y: -0.15 * fontScale,
        font: { size: 11 * fontScale },
      },
      hovermode: 'closest',
      hoverlabel: {
        bordercolor: 'rgba(0,0,0,0.12)',
        font: { family: 'Inter, sans-serif', size: 12 * fontScale, color: '#fff' },
      },
    };

    const config: Partial<Config> = {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      displaylogo: false,
      toImageButtonOptions: { scale: 2 },
    };

    // Correlation coefficient R annotation
    const rAnnotation = {
      xref: 'paper' as const,
      yref: 'paper' as const,
      x: 0.99,
      y: 0.99,
      xanchor: 'right' as const,
      yanchor: 'top' as const,
      showarrow: false,
      font: { size: 13 * fontScale, color: cc.annotationColor, family: 'Inter, sans-serif' },
      bgcolor: cc.annotationBg,
      borderpad: 4,
      text: '',
    };

    const xAx = xAxis;
    const yAx = yAxis;
    const betterAnnotations = buildBetterAnnotations(xAxis, yAxis, fontScale);
    function updateRAnnotation(visibleIndices?: Set<number>): void {
      if (currentShowCorrelation) {
        const visibleRows = visibleIndices
          ? traceRows.filter((_, i) => visibleIndices.has(i)).flat()
          : rows;
        const r = calcCorrelation(visibleRows, xAx, yAx);
        rAnnotation.text = r !== null ? `R = ${r.toFixed(3)}` : '';
      } else {
        rAnnotation.text = '';
      }
      layout.annotations = [
        ...(rAnnotation.text ? [rAnnotation] : []),
        ...(currentShowBetter ? betterAnnotations : []),
      ];
    }

    updateRAnnotation();
    Plotly.purge('scatter-plot');
    await Plotly.newPlot('scatter-plot', traces, layout, config);

    // ── Responsive margin update on breakpoint crossing ──
    if (analysisResizeObserver) analysisResizeObserver.disconnect();
    analysisResizeObserver = new ResizeObserver(() => {
      const isNarrow = window.innerWidth <= 540;
      if (isNarrow === wasNarrow) return;
      wasNarrow = isNarrow;
      const u = narrowLayout(isNarrow);
      Plotly.relayout('scatter-plot', {
        margin: u.margin,
        'xaxis.title.standoff': u.xStandoff,
        'yaxis.title.standoff': u.yStandoff,
      });
    });
    analysisResizeObserver.observe(plotEl);

    // Predict visibility state after legend click/doubleclick, then update R
    type PlotlyGd = HTMLElement & { data?: Array<{ visible?: boolean | 'legendonly' }> };
    function getVisibility(): boolean[] {
      const gd2 = plotEl as PlotlyGd;
      if (!gd2.data) return [];
      return gd2.data.map((tr) => tr.visible !== false && tr.visible !== 'legendonly');
    }

    function recalcRWith(visible: Set<number>): void {
      updateRAnnotation(visible);
      Plotly.relayout('scatter-plot', { annotations: layout.annotations || [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gd = plotEl as any;
    gd.on('plotly_legendclick', (evt: { curveNumber: number }) => {
      const cur = getVisibility();
      cur[evt.curveNumber] = !cur[evt.curveNumber];
      const visible = new Set<number>();
      cur.forEach((v, i) => { if (v) visible.add(i); });
      setTimeout(() => recalcRWith(visible), 0);
    });
    // Emphasize hovered legend item by enlarging its markers.
    // plotly_legendhover doesn't reliably fire, so bind DOM listeners directly.
    const BASE_MARKER_SIZE = 7;
    const HOVER_MARKER_SIZE = 10;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gdAny = gd as any;
    const setLegendHover = (idx: number | null): void => {
      if (!gdAny.data) return;
      const sizes = gdAny.data.map((_: unknown, i: number) =>
        i === idx ? HOVER_MARKER_SIZE : BASE_MARKER_SIZE,
      );
      // Pin axis ranges so Plotly doesn't re-fit the plot for the larger markers.
      const fl = gdAny._fullLayout;
      const xRange = fl?.xaxis?.range ? (fl.xaxis.range as number[]).slice() : null;
      const yRange = fl?.yaxis?.range ? (fl.yaxis.range as number[]).slice() : null;
      const relayout: Record<string, unknown> = {};
      if (xRange) relayout['xaxis.range'] = xRange;
      if (yRange) relayout['yaxis.range'] = yRange;
      (Plotly as any).update(gdAny, { 'marker.size': sizes }, relayout);
    };
    const getTraceIndexFromLegendItem = (item: Element): number | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (item as any).__data__;
      const node = Array.isArray(d) ? d[0] : d;
      const trace = node && (node.trace ?? node);
      const idx = trace && (trace.index ?? trace._expandedIndex);
      return typeof idx === 'number' ? idx : null;
    };
    requestAnimationFrame(() => {
      const items = gdAny.querySelectorAll('g.legend g.traces');
      items.forEach((item: Element) => {
        item.addEventListener('mouseenter', () => {
          const idx = getTraceIndexFromLegendItem(item);
          if (idx != null) setLegendHover(idx);
        });
        item.addEventListener('mouseleave', () => setLegendHover(null));
      });
    });

    gd.on('plotly_legenddoubleclick', (evt: { curveNumber: number }) => {
      const cur = getVisibility();
      const allVisible = cur.every(Boolean);
      const onlyThisVisible = cur.every((v, i) => v === (i === evt.curveNumber));
      const visible = new Set<number>();
      if (onlyThisVisible || allVisible) {
        if (onlyThisVisible) {
          cur.forEach((_, i) => visible.add(i));
        } else {
          visible.add(evt.curveNumber);
        }
      } else {
        visible.add(evt.curveNumber);
      }
      setTimeout(() => recalcRWith(visible), 0);
    });
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
      <button data-action="frieve">${t('analysis.ctx.search_frieve')}</button>
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

    menu.querySelector('[data-action="compare"]')!.addEventListener('click', (ev) => {
      dismissCtxMenu();
      const e = ev as MouseEvent;
      const keepOnPage = e.ctrlKey || e.metaKey;
      let ids: string[] = [];
      try {
        const raw = sessionStorage.getItem('compare_ids');
        ids = raw ? JSON.parse(raw) : [];
      } catch { /* empty */ }
      if (ids.includes(row.product_id)) {
        if (keepOnPage) showToast(t('common.added_to_compare'));
        else navigate('compare', { ids: ids.join(',') });
        return;
      }
      if (ids.length >= MAX_COMPARE_PRODUCTS) {
        showToast(t('common.compare_full'));
        return;
      }
      ids.push(row.product_id);
      sessionStorage.setItem('compare_ids', JSON.stringify(ids));
      if (keepOnPage) {
        showToast(t('common.added_to_compare'));
      } else {
        navigate('compare', { ids: ids.join(',') });
      }
    });

    menu.querySelector('[data-action="google"]')!.addEventListener('click', () => {
      dismissCtxMenu();
      window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, '_blank');
    });

    menu.querySelector('[data-action="frieve"]')!.addEventListener('click', () => {
      dismissCtxMenu();
      const q = searchQuery.split(/\s+/).map(encodeURIComponent).join('+');
      const lang = getLocale() === 'ja' ? 'ja' : 'en';
      window.open(`https://audioreview.frieve.com/search/${lang}/?q=${q}`, '_blank');
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
    currentY = currentPreset?.y || 'sinad_db';
    currentColor = currentPreset?.color || 'category_primary';
    currentSymbol = 'none';
    currentXDataSource = 'best';
    currentYDataSource = 'best';
    selectedCats = [];
    currentKeyword = '';
    currentLabels = false;
    currentLabelsPareto = false;
    currentShowCorrelation = true;
    currentShowPareto = true;
    currentShowBetter = true;
    syncUrl();
    await renderControls();
    renderPresets();
    await renderPlot();
  });

  // Basic/Advanced mode toggle — persists in localStorage, untouched by Reset.
  async function setUiMode(mode: UiMode): Promise<void> {
    if (mode === uiMode) return;
    uiMode = mode;
    saveUiMode(mode);
    document.getElementById('mode-basic')?.classList.toggle('active', mode === 'basic');
    document.getElementById('mode-advanced')?.classList.toggle('active', mode === 'advanced');
    await renderControls();
    renderPlot();
  }
  document.getElementById('mode-basic')!.addEventListener('click', () => setUiMode('basic'));
  document.getElementById('mode-advanced')!.addEventListener('click', () => setUiMode('advanced'));

  await renderControls();
  renderPresets();
  syncUrl();
  await renderPlot();
}

function calcCorrelation(
  rows: Array<{ x_val: number; y_val: number }>,
  xAxis: { scale: string },
  yAxis: { scale: string },
): number | null {
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
    x_val_raw: number;
    y_val_raw: number;
    brand_label: string;
    product_name: string;
    price_anchor_usd: number | null;
    source_type?: string;
    x_src?: string;
    y_src?: string;
  }>,
  xAxis: AxisInfo,
  yAxis: AxisInfo,
  color?: string,
  showLabels?: boolean,
  paretoSet?: Set<string> | null,
  symbol?: string,
): Data {
  const xLabel = getAxisLabel(xAxis as import('../presets').AxisDef);
  const yLabel = getAxisLabel(yAxis as import('../presets').AxisDef);
  const srcAnnot = (src: string | undefined): string => {
    if (!src || src === 'meta' || src === 'unknown') return '';
    // Only annotate when we actually know it came from spec or measured.
    if (src !== 'spec' && src !== 'measured') return '';
    return ` (${t('analysis.source_type.' + src)})`;
  };
  const hoverTexts = data.map((d) => {
    const isPriceAxis = xAxis.id === 'price_anchor_usd' || xAxis.id === 'msrp_usd'
      || yAxis.id === 'price_anchor_usd' || yAxis.id === 'msrp_usd';
    let tip = `${d.brand_label} ${d.product_name}<br>${xLabel}: ${fmtAxis(d.x_val_raw, xAxis)}${srcAnnot(d.x_src)}<br>${yLabel}: ${fmtAxis(d.y_val_raw, yAxis)}${srcAnnot(d.y_src)}`;
    if (!isPriceAxis) {
      tip += `<br>${t('common.price')}: ${d.price_anchor_usd ? '$' + d.price_anchor_usd.toLocaleString() : t('common.na')}`;
    }
    return tip;
  });
  // When paretoSet is provided, only show labels for Pareto-optimal points
  const hasAnyLabel = showLabels && (!paretoSet || data.some((d) => paretoSet.has(`${d.x_val},${d.y_val}`)));
  return {
    x: data.map((d) => d.x_val),
    y: data.map((d) => d.y_val),
    mode: hasAnyLabel ? 'markers+text' : 'markers',
    type: 'scatter',
    name,
    marker: {
      size: 7,
      opacity: 0.75,
      ...(color ? { color } : {}),
      ...(symbol ? { symbol } : {}),
    },
    hovertext: hoverTexts,
    hoverinfo: 'text',
    ...(hasAnyLabel ? {
      text: data.map((d) =>
        paretoSet && !paretoSet.has(`${d.x_val},${d.y_val}`) ? '' : d.product_name,
      ),
      textposition: 'top center',
      textfont: { size: 11 },
    } : {
      text: hoverTexts,
    }),
  } as Data;
}
