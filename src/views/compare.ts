import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { query } from '../db/database';
import { getCategoryLabel, getScaleForField, computeBarPercent, getAxis, productDisplayName } from '../presets';
import { t, getLocale, tAxis } from '../i18n';
import { showSourceMenu, dismissSourceMenu, setupSourceMenuDismiss, fetchAllSourceUrls, fetchSourceUrls } from '../sources';
import { slugify } from './product';
import { setupColHelpTooltips } from '../components/col-help';
import { isRowValueMeasured, measuredBadgeSvg, setupMeasuredBadgeTooltips } from '../components/measured-indicator';
import { attachClearable } from '../components/clearable-input';
import { chartColors } from '../theme';
import { sig3 as _sig3, formatHz as _formatHz, escHtml as _escHtml, getExtendedCompactFields, isCompactFieldVisible, type CompactField, formatHzUnit, formatDbSigned } from '../format-utils';
import { getRankingAxes, createRankingSection } from '../components/ranking-bar-widget';
import { setupViewportTable } from '../components/viewport-table';
import { buildTargetTrace, getTargetCurveLabel, rawToDeviation } from '../target-curves';

let cleanupDocListener: (() => void) | null = null;
let cleanupViewportTable: (() => void) | null = null;

const STORAGE_KEY = 'compare_ids';
const SPLIT_STORAGE_KEY = 'compare_split_measured';

export const MAX_COMPARE_PRODUCTS = 20;

function loadIds(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIds(ids: string[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function loadSplit(): boolean {
  try {
    return localStorage.getItem(SPLIT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveSplit(v: boolean): void {
  try {
    localStorage.setItem(SPLIT_STORAGE_KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

/**
 * Filter compare fields based on the "split spec/measured" mode.
 * - When split=false: hide *_measured and *_spec fields whose base key also exists
 *   (so only the "best" field is shown).
 * - When split=true: hide base fields that have a *_measured or *_spec sibling
 *   (so only the spec and measured values are shown independently).
 */
function filterFieldsForSplitMode<T extends { key: string }>(fields: T[], split: boolean): T[] {
  const keys = new Set(fields.map((f) => f.key));
  const baseOf = (k: string): string | null => {
    if (k.endsWith('_measured')) return k.slice(0, -'_measured'.length);
    if (k.endsWith('_spec')) return k.slice(0, -'_spec'.length);
    return null;
  };
  const hasSiblings = (k: string) => keys.has(`${k}_measured`) || keys.has(`${k}_spec`);
  return fields.filter((f) => {
    const base = baseOf(f.key);
    const isSibling = base != null && keys.has(base);
    if (split) {
      // Hide the base (best) when it has siblings; keep siblings.
      return !hasSiblings(f.key);
    }
    // Hide siblings when the base exists; keep the base (best).
    return !isSibling;
  });
}

function getCompareFields() {
  return [
    { key: 'category_primary', labelKey: 'compare.field.category', format: (v: unknown) => getCategoryLabel(v as string) },
    { key: 'price_anchor_usd', labelKey: 'compare.field.price', format: (v: unknown) => v != null ? Math.round(Number(v)).toLocaleString() : '—' },
    { key: 'release_year', labelKey: 'compare.field.year', format: (v: unknown) => v ?? '—' },
    { key: 'sinad_db', labelKey: 'compare.field.sinad', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'sinad_db_measured', labelKey: 'compare.field.sinad_measured', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'sinad_db_spec', labelKey: 'compare.field.sinad_spec', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'snr_db', labelKey: 'compare.field.snr', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'thd_percent', labelKey: 'compare.field.thd', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'thd_percent_measured', labelKey: 'compare.field.thd_measured', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'thd_percent_spec', labelKey: 'compare.field.thd_spec', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'dynamic_range_db', labelKey: 'compare.field.dynamic_range', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'crosstalk_db', labelKey: 'compare.field.crosstalk', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'impedance_ohm', labelKey: 'compare.field.impedance', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'sensitivity_proxy_db', labelKey: 'compare.field.sensitivity', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'driveability_index', labelKey: 'compare.field.driveability', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'weight_g', labelKey: 'compare.field.weight', format: (v: unknown) => {
      if (v == null) return '—';
      const n = Number(v);
      if (n >= 1000) return parseFloat((n / 1000).toPrecision(3)).toString() + 'k';
      return sig3(n);
    } },
    { key: 'driver_total_count', labelKey: 'compare.field.driver_count', format: (v: unknown) => v != null ? String(Math.round(Number(v))) : '—' },
    { key: 'freq_low_hz', labelKey: 'compare.field.freq_low', format: (v: unknown) => v != null ? formatHz(Number(v)) : '—' },
    { key: 'freq_high_hz', labelKey: 'compare.field.freq_high', format: (v: unknown) => v != null ? formatHz(Number(v)) : '—' },
    { key: 'fr_harman_std_db', labelKey: 'compare.field.fr_harman_std', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'fr_harman_avg_db', labelKey: 'compare.field.fr_harman_avg', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score', labelKey: 'compare.field.preference_score', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score_with_sub', labelKey: 'compare.field.preference_score_with_sub', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score_eq', labelKey: 'compare.field.preference_score_eq', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score_eq_with_sub', labelKey: 'compare.field.preference_score_eq_with_sub', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_power_mw_32ohm', labelKey: 'compare.field.amp_power_mw_32ohm', format: (v: unknown) => v != null ? (Number(v) >= 1000 ? parseFloat(Number(v).toPrecision(3)).toLocaleString() : sig3(Number(v))) : '—' },
    { key: 'amp_power_w', labelKey: 'compare.field.amp_power_w', format: (v: unknown) => v != null ? (Number(v) >= 1000 ? parseFloat(Number(v).toPrecision(3)).toLocaleString() : sig3(Number(v))) : '—' },
    { key: 'amp_voltage_vrms', labelKey: 'compare.field.amp_voltage_vrms', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_voltage_vrms_balanced', labelKey: 'compare.field.amp_voltage_vrms_balanced', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_output_impedance_ohm', labelKey: 'compare.field.amp_output_impedance_ohm', format: (v: unknown) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'amp_output_impedance_ohm_measured', labelKey: 'compare.field.amp_output_impedance_ohm_measured', format: (v: unknown) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'amp_output_impedance_ohm_spec', labelKey: 'compare.field.amp_output_impedance_ohm_spec', format: (v: unknown) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'line_output_impedance_ohm', labelKey: 'compare.field.line_output_impedance_ohm', format: (v: unknown) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'line_output_impedance_ohm_measured', labelKey: 'compare.field.line_output_impedance_ohm_measured', format: (v: unknown) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'line_output_impedance_ohm_spec', labelKey: 'compare.field.line_output_impedance_ohm_spec', format: (v: unknown) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'crossover_freqs_hz_json', labelKey: 'compare.field.crossover', format: (v: unknown) => {
      if (v == null) return '—';
      try {
        const arr = JSON.parse(v as string) as number[];
        return arr.map((n) => formatHz(n)).join(', ');
      } catch {
        return String(v);
      }
    } },
    { key: 'power_consumption_w', labelKey: 'compare.field.power_w', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
  ];
}

export async function renderCompare(
  container: HTMLElement,
  params: URLSearchParams,
): Promise<void> {
  // Merge URL params with stored IDs: URL params take priority if present
  const idsParam = params.get('ids') || '';
  const urlIds = idsParam.split(',').filter(Boolean);
  const storedIds = loadIds();

  // If URL has IDs, use those (and save them). Otherwise restore from storage.
  // Cap at MAX_COMPARE_PRODUCTS to guard against pathological URLs.
  const ids = (urlIds.length > 0 ? urlIds : storedIds).slice(0, MAX_COMPARE_PRODUCTS);
  saveIds(ids);

  let split = loadSplit();

  // Sync restored IDs to URL so the share button captures the full state
  if (ids.length > 0 && urlIds.length === 0) {
    history.replaceState(null, '', `/compare?ids=${ids.join(',')}`);
  }

  container.innerHTML = `
    <div class="view-header">
      <h1>${t('compare.title')}</h1>
      <p>${t('compare.subtitle')}</p>
    </div>
    <div class="controls-bar">
      <div class="control-group product-search" style="flex:1;min-width:360px;max-width:400px">
        <label>${t('compare.label.add')}</label>
        <input type="search" id="compare-search" placeholder="${t('compare.placeholder.search')}" style="width:100%"/>
        <div class="search-results" id="compare-results" style="display:none"></div>
      </div>
      <div class="control-group" style="display:flex;flex-direction:row;align-items:center;margin-left:auto;gap:0.75rem;flex-wrap:wrap;justify-content:flex-end">
        <label style="display:flex;align-items:center;gap:0.35rem;white-space:nowrap;font-size:0.85rem;cursor:pointer;flex-shrink:0">
          <input type="checkbox" id="compare-split-measured" ${split ? 'checked' : ''}/>
          ${t('compare.split_spec_measured')}
        </label>
        <div style="display:flex;flex-direction:row;align-items:center;gap:0.75rem;flex-shrink:0">
          <button id="compare-download" title="${t('common.download.tooltip')}">${t('common.download')}</button>
          <button id="compare-clear-all" class="danger">${t('common.clear_all')}</button>
        </div>
      </div>
    </div>
    <div id="compare-content"></div>
  `;

  // Download CSV button
  document.getElementById('compare-download')!.addEventListener('click', async () => {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query<Record<string, unknown>>(
      `SELECT
        p.*,
        coalesce(p.street_price_usd, p.msrp_usd) as price_anchor_usd,
        CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END as brand_label
      FROM web_product_core p
      WHERE p.product_id IN (${placeholders})`,
      ids,
    );
    const ordered = ids.map((id) => rows.find((r) => r.product_id === id)).filter(Boolean) as Record<string, unknown>[];
    const compareFields = filterFieldsForSplitMode(getCompareFields(), split);
    // Transposed layout matching the display: rows = fields, columns = products
    const visibleFields = compareFields.filter((f) => ordered.some((r) => r[f.key] != null));
    const productNames = ordered.map((r) => `${r.brand_label} ${productDisplayName(r as unknown as { product_name: string; variant?: string })}`);

    const headerRow = ['', ...productNames];
    const fieldRows = visibleFields.map((f) => [
      t(f.labelKey),
      ...ordered.map((r) => {
        const v = r[f.key];
        if (v == null) return '';
        return formatFieldCsv(f.key, v);
      }),
    ]);

    // Append compact (extended) fields
    const compactFields = getExtendedCompactFields()
      .filter((cf) => ordered.some((r) => isCompactFieldVisible(cf, r) && cf.formatRow(r) != null));
    const compactRows = compactFields.map((cf) => [
      t(cf.labelKey),
      ...ordered.map((r) => {
        if (!isCompactFieldVisible(cf, r)) return '';
        const html = cf.formatRow(r);
        if (html == null) return '';
        // Strip HTML tags for CSV (e.g. tagBadges <span> wrappers)
        return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
      }),
    ]);

    downloadCsv([headerRow, ...fieldRows, ...compactRows], 'audiospecs_compare.csv');
  });

  // Split spec/measured toggle
  document.getElementById('compare-split-measured')!.addEventListener('change', (e) => {
    split = (e.target as HTMLInputElement).checked;
    saveSplit(split);
    loadCompare();
  });

  // Clear all button
  document.getElementById('compare-clear-all')!.addEventListener('click', () => {
    ids.length = 0;
    saveIds(ids);
    history.replaceState(null, '', '/compare');
    loadCompare();
  });

  // Search
  const searchInput = document.getElementById('compare-search') as HTMLInputElement;
  const resultsEl = document.getElementById('compare-results')!;
  let searchTimeout: ReturnType<typeof setTimeout>;

  attachClearable(searchInput, () => {
    resultsEl.style.display = 'none';
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) {
        resultsEl.style.display = 'none';
        return;
      }
      const keywords = q.split(/\s+/).filter(Boolean);
      const kwConditions = keywords.map(() => "(product_name LIKE ? OR brand_name_en LIKE ?)");
      const kwParams = keywords.flatMap((kw) => { const like = `%${kw}%`; return [like, like]; });
      const results = await query<{ product_id: string; brand_name_en: string; product_name: string; variant: string; category_primary: string }>(
        `SELECT product_id, brand_name_en, product_name, variant, category_primary
         FROM web_product_core
         WHERE ${kwConditions.join(' AND ')}
         LIMIT 10`,
        kwParams,
      );
      if (!results.length) {
        resultsEl.innerHTML = `<div class="search-result-item" style="color:var(--text-tertiary)">${t('common.no_results')}</div>`;
      } else {
        resultsEl.innerHTML = results
          .map(
            (r) => `
          <div class="search-result-item" data-id="${r.product_id}">
            ${productDisplayName(r)}
            <div class="result-brand">${r.brand_name_en || t('common.unknown')} · ${getCategoryLabel(r.category_primary)}</div>
          </div>`,
          )
          .join('');
      }
      resultsEl.style.display = 'block';
      resultsEl.querySelectorAll('[data-id]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = (el as HTMLElement).dataset.id!;
          if (!ids.includes(id) && ids.length < MAX_COMPARE_PRODUCTS) {
            ids.push(id);
            saveIds(ids);
            history.replaceState(null, '', `/compare?ids=${ids.join(',')}`);
            resultsEl.style.display = 'none';
            searchInput.value = '';
            loadCompare();
          }
        });
      });
    }, 200);
  });

  // Clean up previous document listener if any
  if (cleanupDocListener) cleanupDocListener();
  const controller = new AbortController();
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.product-search')) {
      resultsEl.style.display = 'none';
    }
  }, { signal: controller.signal });
  cleanupDocListener = () => controller.abort();

  async function loadCompare(): Promise<void> {
    const contentEl = document.getElementById('compare-content')!;
    if (!ids.length) {
      contentEl.innerHTML = `
        <div class="card">
          <div class="card-body compare-empty-state">
            <svg class="compare-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <p class="compare-empty-line1">${t('compare.empty.line1')}</p>
            <p class="compare-empty-line2">${t('compare.empty.line2')}</p>
          </div>
        </div>
      `;
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    const rows = await query<Record<string, unknown>>(
      `SELECT
        p.*,
        coalesce(p.street_price_usd, p.msrp_usd) as price_anchor_usd,
        CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END as brand_label
      FROM web_product_core p
      WHERE p.product_id IN (${placeholders})`,
      ids,
    );

    // Keep order
    const ordered = ids.map((id) => rows.find((r) => r.product_id === id)).filter(Boolean) as Record<string, unknown>[];
    const compareFields = filterFieldsForSplitMode(getCompareFields(), split);

    // Query global min/max for bar normalization
    const numericFieldKeys = compareFields.filter((f) => f.key !== 'category_primary').map((f) => f.key);
    const minMaxExprs = numericFieldKeys.map((k) => {
      const src = k === 'price_anchor_usd' ? 'coalesce(street_price_usd, msrp_usd)' : k;
      return `MIN(${src}) as "min_${k}", MAX(${src}) as "max_${k}"`;
    }).join(', ');
    const [globalStats] = await query<Record<string, number>>(
      `SELECT ${minMaxExprs} FROM web_product_core`,
    );

    const globalRange: Record<string, { min: number; max: number }> = {};
    for (const k of numericFieldKeys) {
      globalRange[k] = { min: globalStats[`min_${k}`], max: globalStats[`max_${k}`] };
    }

    // ── FR chart ──
    const frProductIds = ordered
      .filter((r) => r.has_fr_data === 1)
      .map((r) => r.product_id as string);

    let frHtml = '';
    if (frProductIds.length > 0) {
      frHtml = `
        <div class="card" style="margin-bottom:1rem">
          <div class="card-body">
            <h3 style="margin:0 0 0.5rem">${t('compare.fr.title')}</h3>
            <span class="fr-toggles"><span class="fr-toggle-group"><label class="fr-target-toggle"><input type="checkbox" id="compare-fr-target-cb" checked> ${_escHtml(t('compare.fr.target_curve'))}</label><span class="col-help" data-tooltip="${_escHtml(t('compare.fr.target_curve_tip'))}">?</span></span>
            <span class="fr-toggle-group"><label class="fr-target-toggle"><input type="checkbox" id="compare-fr-deviation-cb"> ${_escHtml(t('compare.fr.deviation'))}</label><span class="col-help" data-tooltip="${_escHtml(t('compare.fr.deviation_tip'))}">?</span></span></span>
            <div id="compare-fr-plot" style="width:100%;height:400px"></div>
            <div id="compare-fr-sources" class="fr-sources-row" style="margin-top:0.5rem;font-size:13px;color:var(--text-secondary, #666)"></div>
          </div>
        </div>
      `;
    }

    contentEl.innerHTML = frHtml + `
      <div class="card" style="margin-top:1rem">
        <h3 style="margin:0 0 0;padding:1.25rem 1.25rem 0.5rem">${t('product.specifications')}</h3>
        <div class="card-body compare-scroll">
          <div class="compare-grid" style="grid-template-columns: 180px repeat(${ordered.length}, minmax(160px, 1fr))">
            <div class="compare-header compare-corner"></div>
            ${ordered.map((r) => {
              const _brand = String(r.brand_label || 'unknown');
              const _prodName = productDisplayName(r as unknown as { product_name: string; variant?: string });
              const _href = `/product/${slugify(_brand)}/${slugify(String(r.product_name || ''))}`;
              return `
              <div class="compare-header">
                <a href="${_href}" class="compare-product-link" title="${escHtml(t('analysis.ctx.details'))}">${_brand} ${_prodName}</a>
                <br/><button class="remove-compare" data-id="${r.product_id}" style="font-size:0.7rem;margin-top:0.25rem">${t('common.remove')}</button>
              </div>
            `;
            }).join('')}
            ${compareFields.filter((f) => ordered.some((r) => r[f.key] != null)).map((f) => {
              const range = globalRange[f.key];
              const scale = getScaleForField(f.key);
              const descKey = `axisdesc.${f.key}`;
              const desc = t(descKey);
              const hasDesc = desc !== descKey;
              const helpIcon = hasDesc ? `<span class="col-help" data-tooltip="${escHtml(desc)}">?</span>` : '';
              // Determine best value when comparing 2+ products for fields with a defined better direction.
              const better = getAxis(f.key)?.better;
              let bestValue: number | null = null;
              if (better && ordered.length >= 2) {
                const nums = ordered
                  .map((r) => r[f.key])
                  .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
                if (nums.length >= 2) {
                  bestValue = better === 'higher' ? Math.max(...nums) : Math.min(...nums);
                }
              }
              const fmtCell = (v: number): string => {
                const s = String(f.format(v));
                return bestValue != null && v === bestValue ? `<strong>${s}</strong>` : s;
              };
              return `
              <div class="compare-label">${formatUnitCasing(t(f.labelKey))}${helpIcon}</div>
              ${ordered.map((r) => {
                const v = r[f.key];
                const pid = r.product_id as string;
                const badge = isRowValueMeasured(r, f.key) ? measuredBadgeSvg() : '';
                if (typeof v === 'number' && range && range.min != null && range.max != null) {
                  const pct = computeBarPercent(v, range.min, range.max, scale);
                  return `<div class="compare-cell numeric bar-cell" data-product-id="${pid}" data-col="${f.key}" style="--bar-pct:${pct.toFixed(1)}">${fmtCell(v)}${badge}</div>`;
                }
                if (typeof v === 'number') {
                  return `<div class="compare-cell numeric" data-product-id="${pid}" data-col="${f.key}">${fmtCell(v)}${badge}</div>`;
                }
                return `<div class="compare-cell">${f.format(v)}</div>`;
              }).join('')}`;
            }).join('')}
            ${getExtendedCompactFields().filter((cf) => ordered.some((r) => isCompactFieldVisible(cf, r) && cf.formatRow(r) != null)).map((cf) => `
              <div class="compare-label">${escHtml(t(cf.labelKey))}</div>
              ${ordered.map((r) => {
                const pid = r.product_id as string;
                if (!isCompactFieldVisible(cf, r)) return `<div class="compare-cell">—</div>`;
                const html = cf.formatRow(r);
                if (html == null) return `<div class="compare-cell">—</div>`;
                const colIds = JSON.stringify(cf.sourceKeys);
                return `<div class="compare-cell compact-cell" data-product-id="${pid}" data-compact-cols='${escHtml(colIds)}'>${html}</div>`;
              }).join('')}
            `).join('')}
            <div class="compare-label">${t('compare.field.search')}</div>
            ${ordered.map((r) => `<div class="compare-cell" style="display:flex;justify-content:center"><div class="search-icons">
              <button class="search-google" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Google">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              </button>
              <button class="search-amazon" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Amazon [PR]">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6.61 11.802c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02z"/><path fill="#FF9900" d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13z"/><path fill="#FF9900" d="M19.525 18.448c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z"/></svg>
              </button>
              ${r.review_url_frieve_audio_review ? `<button class="search-frieve" data-ref="${escHtml(String(r.review_url_frieve_audio_review))}" title="${escHtml(t('analysis.ctx.open_frieve'))}">🎧</button>` : ''}
            </div></div>`).join('')}
            <div class="compare-label">${t('compare.field.sources')}</div>
            ${ordered.map((r) => `<div class="compare-cell compare-sources-cell" data-sources-for="${r.product_id}"></div>`).join('')}
          </div>
        </div>
      </div>
    `;

    // ── Render FR plot ──
    if (frProductIds.length > 0) {
      const frPlaceholders = frProductIds.map(() => '?').join(',');
      const frRows = await query<{ product_id: string; series_type: string; points_json: string }>(
        `SELECT product_id, series_type, points_json FROM web_fr_data WHERE product_id IN (${frPlaceholders})`,
        frProductIds,
      );

      const TRACE_COLORS = ['#7c3aed', '#db2777', '#2563eb', '#059669', '#d97706'];
      const TRACE_DASHES = ['solid', 'dot', 'dash', 'dashdot', 'longdash'] as const;

      // Collect raw and deviation points per product
      interface FrEntry { rawPts: [number, number][]; devPts: [number, number][]; name: string; colorIdx: number; dashIdx: number; }
      const frEntries: FrEntry[] = [];
      const frCategories = new Set<string>();

      for (let i = 0; i < ordered.length; i++) {
        const pid = ordered[i].product_id as string;
        const fr = frRows.find((r) => r.product_id === pid && r.series_type === 'raw')
          ?? frRows.find((r) => r.product_id === pid);
        if (!fr) continue;
        const cat = ordered[i].category_primary as string;
        frCategories.add(cat);
        const rawPts: [number, number][] = JSON.parse(fr.points_json);
        const devPts = rawToDeviation(rawPts, cat);
        frEntries.push({
          rawPts,
          devPts,
          name: `${ordered[i].brand_label} ${productDisplayName(ordered[i] as unknown as { product_name: string; variant?: string })}`,
          colorIdx: i % TRACE_COLORS.length,
          dashIdx: Math.floor(i / TRACE_COLORS.length) % TRACE_DASHES.length,
        });
      }

      // Build target curve traces (one per distinct category type)
      const targetTraces: Data[] = [];
      const addedTargets = new Set<string>();
      for (const cat of frCategories) {
        const label = getTargetCurveLabel(cat);
        if (addedTargets.has(label)) continue;
        addedTargets.add(label);
        targetTraces.push(buildTargetTrace(cat));
      }

      if (frEntries.length > 0) {
        const baseFontPx = 16;
        const currentFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize || `${baseFontPx}`);
        const fontScale = Number.isFinite(currentFontPx) ? currentFontPx / baseFontPx : 1.25;

        const cc = chartColors();
        const baseLayout: Partial<Layout> = {
          xaxis: {
            title: { text: t('compare.fr.xaxis'), font: { family: 'Inter, sans-serif', size: 13 * fontScale, color: cc.axisTitleColor }, standoff: 10 * fontScale },
            type: 'log',
            hoverformat: '.3~s',
            gridcolor: cc.gridcolor,
            zerolinecolor: cc.zerolinecolor,
          } as Partial<Layout>['xaxis'],
          yaxis: {
            tickformat: '+d',
            gridcolor: cc.gridcolor,
            zerolinecolor: cc.zerolinecolor,
          } as Partial<Layout>['yaxis'],
          paper_bgcolor: cc.paper_bgcolor,
          plot_bgcolor: cc.plot_bgcolor,
          font: { family: 'Inter, sans-serif', size: 12 * fontScale, ...(cc.fontColor ? { color: cc.fontColor } : {}) },
          margin: { l: 60 * fontScale, r: 20 * fontScale, t: 10 * fontScale, b: 55 * fontScale },
          legend: {
            orientation: 'h',
            y: -0.2,
            font: { size: 11 * fontScale },
          },
          hovermode: 'x unified',
        };

        const plotConfig: Partial<Config> = {
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          displaylogo: false,
          toImageButtonOptions: { scale: 2 },
        };

        const renderCompareFr = (showTarget: boolean, showDeviation: boolean) => {
          const productTraces: Data[] = frEntries.map((e) => {
            const pts = showDeviation ? e.devPts : e.rawPts;
            return {
              x: pts.map((p) => p[0]),
              y: pts.map((p) => p[1]),
              customdata: pts.map((p) => `${formatDbSigned(p[1])} dB`),
              type: 'scatter' as const,
              mode: 'lines' as const,
              name: e.name,
              line: { color: TRACE_COLORS[e.colorIdx], width: 1.5, dash: TRACE_DASHES[e.dashIdx] },
              hovertemplate: '%{fullData.name}: %{customdata}<extra></extra>',
            };
          });
          const yTitle = showDeviation ? t('compare.fr.yaxis') : t('compare.fr.yaxis_abs');
          const yRange: [number, number] = showDeviation ? [-12, 12] : [-24, 18];
          const yDtick = showDeviation ? 3 : 6;
          const layout = {
            ...baseLayout,
            yaxis: { ...baseLayout.yaxis, range: yRange, dtick: yDtick, title: { text: yTitle, font: { family: 'Inter, sans-serif', size: 13 * fontScale, color: cc.axisTitleColor }, standoff: 10 * fontScale } },
          };

          let allTraces: Data[];
          if (showDeviation) {
            const first = frEntries[0].rawPts;
            const zeroTrace: Data = {
              x: [first[0][0], first[first.length - 1][0]],
              y: [0, 0],
              type: 'scatter',
              mode: 'lines',
              name: 'Target (0 dB)',
              line: { color: 'rgba(150,150,150,0.5)', width: 2, dash: 'dot' },
              hoverinfo: 'skip',
              showlegend: true,
            };
            allTraces = [zeroTrace, ...productTraces];
          } else {
            allTraces = showTarget ? [...productTraces, ...targetTraces] : [...productTraces];
          }
          Plotly.react('compare-fr-plot', allTraces, layout, plotConfig);
        };

        renderCompareFr(true, false);

        // Wire up toggles
        const targetCb = contentEl.querySelector<HTMLInputElement>('#compare-fr-target-cb');
        const devCb = contentEl.querySelector<HTMLInputElement>('#compare-fr-deviation-cb');
        const updateCompareFr = () => {
          const showDev = devCb?.checked ?? false;
          const showTarget = targetCb?.checked ?? true;
          if (targetCb) targetCb.disabled = showDev;
          renderCompareFr(showTarget, showDev);
        };
        if (targetCb) targetCb.addEventListener('change', updateCompareFr);
        if (devCb) devCb.addEventListener('change', updateCompareFr);

        // Rewrite unified hover header to show formatted frequency
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gd = document.getElementById('compare-fr-plot') as any;
        if (gd) {
          gd.on('plotly_hover', (ev: any) => {
            if (!ev?.points?.[0]) return;
            requestAnimationFrame(() => {
              const hdr = gd.querySelector('.hoverlayer .legend text');
              if (hdr?.firstElementChild) hdr.firstElementChild.textContent = formatHzUnit(ev.points[0].x);
            });
          });
        }

        // Emphasize the hovered legend item by thickening its trace line.
        if (gd) {
          const BASE_WIDTH = 1.5;
          const HOVER_WIDTH = 4;
          const setHover = (idx: number | null) => {
            const widths = gd.data.map((_: unknown, i: number) => {
              // First trace may be target/zero — skip it for hover logic
              if (i === 0 && gd.data[0]?.line?.dash === 'dot') return 2;
              return i === idx ? HOVER_WIDTH : BASE_WIDTH;
            });
            (Plotly as any).restyle(gd, { 'line.width': widths });
          };
          requestAnimationFrame(() => {
            const items = gd.querySelectorAll('g.legend g.traces');
            items.forEach((item: Element, idx: number) => {
              item.addEventListener('mouseenter', () => setHover(idx));
              item.addEventListener('mouseleave', () => setHover(null));
            });
          });
        }
      }
    }

    // Populate FR source URLs
    if (frProductIds.length > 0) {
      const frSourcesEl = contentEl.querySelector<HTMLElement>('#compare-fr-sources');
      if (frSourcesEl) {
        frSourcesEl.textContent = '…';
        const allFrUrls = new Set<string>();
        Promise.all(frProductIds.map((pid) => fetchSourceUrls(pid, ['fr_data']))).then((results) => {
          for (const urls of results) urls.forEach((u) => allFrUrls.add(u));
          if (!document.body.contains(frSourcesEl)) return;
          if (allFrUrls.size === 0) {
            frSourcesEl.textContent = '';
            return;
          }
          frSourcesEl.textContent = '';
          const label = document.createElement('span');
          label.textContent = t('compare.fr.sources') + ': ';
          label.style.fontWeight = '600';
          frSourcesEl.appendChild(label);
          let first = true;
          for (const url of allFrUrls) {
            if (!first) frSourcesEl.appendChild(document.createTextNode(', '));
            first = false;
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            try { a.textContent = new URL(url).hostname; } catch { a.textContent = url; }
            a.title = url;
            frSourcesEl.appendChild(a);
          }
        }).catch(() => {
          if (document.body.contains(frSourcesEl)) frSourcesEl.textContent = '';
        });
      }
    }

    // Viewport-filling height + scroll trapping for the compare scroll container
    const compareScroll = contentEl.querySelector<HTMLElement>('.compare-scroll');
    if (cleanupViewportTable) cleanupViewportTable();
    if (compareScroll) cleanupViewportTable = setupViewportTable(compareScroll);

    // Column help tooltips on compare labels
    setupColHelpTooltips(contentEl, compareScroll);
    // Tap/hover tooltip for the measured-value gauge badge
    setupMeasuredBadgeTooltips(contentEl, compareScroll);

    // Populate source URL cells asynchronously
    for (const r of ordered) {
      const cell = contentEl.querySelector<HTMLElement>(`[data-sources-for="${r.product_id}"]`);
      if (!cell) continue;
      cell.textContent = '…';
      fetchAllSourceUrls(r.product_id as string).then((urls) => {
        if (!document.body.contains(cell)) return;
        if (urls.length === 0) {
          cell.textContent = '—';
          return;
        }
        cell.textContent = '';
        for (const url of urls) {
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          try {
            a.textContent = new URL(url).hostname;
          } catch {
            a.textContent = url;
          }
          a.title = url;
          cell.appendChild(a);
        }
      }).catch(() => {
        if (document.body.contains(cell)) cell.textContent = '—';
      });
    }

    // SPA navigation for product links in headers
    contentEl.querySelectorAll<HTMLAnchorElement>('.compare-product-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        history.pushState(null, '', a.getAttribute('href')!);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    });

    contentEl.querySelectorAll('.remove-compare').forEach((btn) => {
      btn.addEventListener('click', () => {
        const removeId = (btn as HTMLElement).dataset.id!;
        const idx = ids.indexOf(removeId);
        if (idx >= 0) ids.splice(idx, 1);
        saveIds(ids);
        history.replaceState(null, '', `/compare?ids=${ids.join(',')}`);
        loadCompare();
      });
    });

    // Search buttons
    contentEl.querySelectorAll('.search-google').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        const q = `${el.dataset.brand} ${el.dataset.name}`.trim();
        window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
      });
    });
    contentEl.querySelectorAll('.search-frieve').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        const ref = el.dataset.ref;
        if (ref) {
          const lang = getLocale() === 'ja' ? 'ja' : 'en';
          window.open(`https://audioreview.frieve.com/products/${lang}/${encodeURIComponent(ref)}/`, '_blank');
        }
      });
    });
    contentEl.querySelectorAll('.search-amazon').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        const q = `${el.dataset.brand} ${el.dataset.name}`.trim();
        const url = getLocale() === 'ja'
          ? `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}&tag=frieve02-22`
          : `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=frieve-20`;
        window.open(url, '_blank');
      });
    });

    // Source context menu on spec cells (right-click / long-tap)
    contentEl.querySelectorAll<HTMLElement>('.compare-cell[data-product-id][data-col]').forEach((cell) => {
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSourceMenu(e.clientX, e.clientY, cell.dataset.productId!, [cell.dataset.col!]);
      });
      let longTapTimer: ReturnType<typeof setTimeout> | null = null;
      cell.addEventListener('touchstart', (ev) => {
        longTapTimer = setTimeout(() => {
          ev.preventDefault();
          const touch = ev.changedTouches[0] || ev.touches[0];
          showSourceMenu(touch.clientX, touch.clientY, cell.dataset.productId!, [cell.dataset.col!]);
        }, 500);
      }, { passive: false });
      cell.addEventListener('touchend', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
      cell.addEventListener('touchmove', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
    });

    // Source context menu on compact cells (sourceKeys stored in data attribute)
    contentEl.querySelectorAll<HTMLElement>('.compact-cell[data-product-id][data-compact-cols]').forEach((cell) => {
      const colIds: string[] = JSON.parse(cell.dataset.compactCols!);
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSourceMenu(e.clientX, e.clientY, cell.dataset.productId!, colIds);
      });
      let longTapTimer: ReturnType<typeof setTimeout> | null = null;
      cell.addEventListener('touchstart', (ev) => {
        longTapTimer = setTimeout(() => {
          ev.preventDefault();
          const touch = ev.changedTouches[0] || ev.touches[0];
          showSourceMenu(touch.clientX, touch.clientY, cell.dataset.productId!, colIds);
        }, 500);
      }, { passive: false });
      cell.addEventListener('touchend', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
      cell.addEventListener('touchmove', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
    });

    // ── Ranking bar charts ──
    if (ordered.length >= 1) {
      const TRACE_COLORS_RANK = ['#7c3aed', '#db2777', '#2563eb', '#059669', '#d97706'];
      // Determine categories of compared products; fetch all products per category
      const categories = [...new Set(ordered.map((r) => r.category_primary as string))];
      for (const cat of categories) {
        const catProducts = await query<Record<string, unknown>>(
          `SELECT p.*,
            coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd,
            CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END AS brand_label
          FROM web_product_core p
          WHERE p.category_primary = ?`,
          [cat],
        );

        const highlights = new Map<string, string>();
        const catOrdered = ordered.filter((r) => r.category_primary === cat);
        for (const r of catOrdered) {
          const globalIdx = ordered.indexOf(r);
          highlights.set(
            r.product_id as string,
            TRACE_COLORS_RANK[globalIdx % TRACE_COLORS_RANK.length],
          );
        }

        const rankingAxes = getRankingAxes(split).filter((a) => a.id !== 'release_year');
        createRankingSection(
          contentEl,
          rankingAxes,
          catProducts,
          highlights,
          `${t('product.rankings')} — ${getCategoryLabel(cat)}`,
        );
      }
    }
  }

  setupSourceMenuDismiss();
  await loadCompare();
}

function sig3(v: number): string {
  const n = parseFloat(v.toPrecision(3));
  if (n !== 0 && Math.abs(n) < 0.001) {
    const digits = -Math.floor(Math.log10(Math.abs(n))) + 2;
    return n.toFixed(digits).replace(/\.?0+$/, '');
  }
  return n.toString();
}

function formatHz(v: number): string {
  if (v >= 1000) return parseFloat((v / 1000).toPrecision(3)).toString() + 'k';
  return sig3(v);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Same significant digits as display format but without units */
function formatFieldCsv(key: string, v: unknown): string {
  if (key === 'category_primary') return getCategoryLabel(v as string);
  if (key === 'price_anchor_usd') return Math.round(Number(v)).toString();
  if (key === 'release_year') return String(v);
  if (key === 'weight_g') return Math.round(Number(v)).toString();
  if (key === 'driver_total_count') return String(Math.round(Number(v)));
  if (key === 'freq_low_hz' || key === 'freq_high_hz'
    || key === 'freq_low_hz_measured' || key === 'freq_high_hz_measured'
    || key === 'freq_low_hz_spec' || key === 'freq_high_hz_spec') return sig3(Number(v));
  if (/^(amp|line)_output_impedance_ohm(_measured|_spec)?$/.test(key) && Number(v) === 0) return '0';
  if (key === 'crossover_freqs_hz_json') {
    try {
      const arr = JSON.parse(v as string) as number[];
      return arr.map((n) => sig3(n)).join('; ');
    } catch { return String(v); }
  }
  return sig3(Number(v));
}

function escapeCsvField(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function downloadCsv(rows: string[][], filename: string): void {
  const csv = rows.map((r) => r.map(escapeCsvField).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatUnitCasing(s: string): string {
  // CSS for compare labels uses `text-transform: uppercase`, so we explicitly protect unit strings.
  return s
    .replace(/\(Hz\)/g, '(<span class="unit-case">Hz</span>)')
    .replace(/\(dB\)/g, '(<span class="unit-case">dB</span>)')
    .replace(/\(g\)/g, '(<span class="unit-case">g</span>)')
    .replace(/\(mW/g, '(<span class="unit-case">mW</span>')
    .replace(/\(Vrms\)/g, '(<span class="unit-case">Vrms</span>)');
}
