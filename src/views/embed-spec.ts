/**
 * Embeddable spec table renderer.
 *
 * Reuses the same field definitions and formatters as the Compare page,
 * but renders a single-product vertical spec table for iframe embedding.
 */

import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { query } from '../db/database';
import { getCategoryLabel, getAxis, getScaleForField, computeBarPercent, productDisplayName } from '../presets';
import { t, getLocale } from '../i18n';
import { isRowValueMeasured, measuredBadgeSvg, setupMeasuredBadgeTooltips } from '../components/measured-indicator';
import { setupColHelpTooltips } from '../components/col-help';
import { showSourceMenu, setupSourceMenuDismiss, fetchSourceUrls } from '../sources';
import { getExtendedCompactFields, isCompactFieldVisible, formatHzUnit, formatDbSigned } from '../format-utils';
import { applyFrOffset, buildTargetTrace, computeFrOffset } from '../target-curves';
import { analyzeFR, type PeakDipResult } from '../components/fr-narration';

/* ── Theme helper for chart colors ── */

function isEmbedDark(): boolean {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function embedChartColors() {
  const dark = isEmbedDark();
  return {
    paper_bgcolor: dark ? '#1a1a1a' : '#fff',
    plot_bgcolor: dark ? '#1a1a1a' : '#fff',
    gridcolor: dark ? '#333' : '#eee',
    zerolinecolor: dark ? '#444' : '#ddd',
    axisTitleColor: dark ? '#ccc' : '#374151',
    fontColor: dark ? '#ccc' : undefined,
  };
}

/* ── Formatters (shared with compare.ts logic) ── */

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

/* ── Field definitions (same as getCompareFields) ── */

interface SpecField {
  key: string;
  labelKey: string;
  format: (v: unknown) => string;
}

function getSpecFields(): SpecField[] {
  return [
    { key: 'price_anchor_usd', labelKey: 'compare.field.price', format: (v) => v != null ? '$' + Math.round(Number(v)).toLocaleString() : '—' },
    { key: 'release_year', labelKey: 'compare.field.year', format: (v) => v != null ? String(v) : '—' },
    { key: 'sinad_db', labelKey: 'compare.field.sinad', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'sinad_db_measured', labelKey: 'compare.field.sinad_measured', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'sinad_db_spec', labelKey: 'compare.field.sinad_spec', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'snr_db', labelKey: 'compare.field.snr', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'thd_percent', labelKey: 'compare.field.thd', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'thd_percent_measured', labelKey: 'compare.field.thd_measured', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'thd_percent_spec', labelKey: 'compare.field.thd_spec', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'dynamic_range_db', labelKey: 'compare.field.dynamic_range', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'crosstalk_db', labelKey: 'compare.field.crosstalk', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'impedance_ohm', labelKey: 'compare.field.impedance', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'sensitivity_proxy_db', labelKey: 'compare.field.sensitivity', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'driveability_index', labelKey: 'compare.field.driveability', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'weight_g', labelKey: 'compare.field.weight', format: (v) => {
      if (v == null) return '—';
      const n = Number(v);
      if (n >= 1000) return parseFloat((n / 1000).toPrecision(3)).toString() + 'k';
      return sig3(n);
    } },
    { key: 'driver_total_count', labelKey: 'compare.field.driver_count', format: (v) => v != null ? String(Math.round(Number(v))) : '—' },
    { key: 'freq_low_hz', labelKey: 'compare.field.freq_low', format: (v) => v != null ? formatHz(Number(v)) : '—' },
    { key: 'freq_high_hz', labelKey: 'compare.field.freq_high', format: (v) => v != null ? formatHz(Number(v)) : '—' },
    { key: 'fr_harman_std_db', labelKey: 'compare.field.fr_harman_std', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'fr_harman_avg_db', labelKey: 'compare.field.fr_harman_avg', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score', labelKey: 'compare.field.preference_score', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score_with_sub', labelKey: 'compare.field.preference_score_with_sub', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score_eq', labelKey: 'compare.field.preference_score_eq', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'preference_score_eq_with_sub', labelKey: 'compare.field.preference_score_eq_with_sub', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_power_mw_32ohm', labelKey: 'compare.field.amp_power_mw_32ohm', format: (v) => v != null ? (Number(v) >= 1000 ? parseFloat(Number(v).toPrecision(3)).toLocaleString() : sig3(Number(v))) : '—' },
    { key: 'amp_power_w', labelKey: 'compare.field.amp_power_w', format: (v) => v != null ? (Number(v) >= 1000 ? parseFloat(Number(v).toPrecision(3)).toLocaleString() : sig3(Number(v))) : '—' },
    { key: 'amp_voltage_vrms', labelKey: 'compare.field.amp_voltage_vrms', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_voltage_vrms_balanced', labelKey: 'compare.field.amp_voltage_vrms_balanced', format: (v) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_output_impedance_ohm', labelKey: 'compare.field.amp_output_impedance_ohm', format: (v) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'amp_output_impedance_ohm_measured', labelKey: 'compare.field.amp_output_impedance_ohm_measured', format: (v) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'amp_output_impedance_ohm_spec', labelKey: 'compare.field.amp_output_impedance_ohm_spec', format: (v) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'line_output_impedance_ohm', labelKey: 'compare.field.line_output_impedance_ohm', format: (v) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'line_output_impedance_ohm_measured', labelKey: 'compare.field.line_output_impedance_ohm_measured', format: (v) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'line_output_impedance_ohm_spec', labelKey: 'compare.field.line_output_impedance_ohm_spec', format: (v) => v != null ? (Number(v) === 0 ? '≈0' : sig3(Number(v))) : '—' },
    { key: 'crossover_freqs_hz_json', labelKey: 'compare.field.crossover', format: (v) => {
      if (v == null) return '—';
      try {
        const arr = JSON.parse(v as string) as number[];
        return arr.map((n) => formatHz(n)).join(', ');
      } catch {
        return String(v);
      }
    } },
    { key: 'power_consumption_w', labelKey: 'compare.field.power_w', format: (v) => v != null ? sig3(Number(v)) : '—' },
  ];
}

/**
 * Filter fields for split spec/measured mode (same logic as compare.ts).
 * In non-split mode: hide _measured/_spec variants whose base also exists.
 * In split mode: hide base fields that have _measured/_spec siblings.
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
    if (split) return !hasSiblings(f.key);
    return !isSibling;
  });
}

/* ── Product matching ── */

interface ProductRow {
  product_id: string;
  brand_name_en: string;
  manufacturer_name_en: string;
  product_name: string;
  variant: string;
  category_primary: string;
  [key: string]: unknown;
}

/**
 * Find a product by brand + product name with progressive fallback:
 * 1. Exact match on brand_name_en + product_name (case-insensitive)
 * 2. brand exact + product LIKE (shortest name wins)
 * 3. Also search manufacturer_name_en for brand
 * 4. Normalized match — strip spaces/hyphens and compare (handles "D90III" → "D90 III Sabre")
 */
async function findProduct(brand: string, product: string): Promise<ProductRow | null> {
  // 1. Exact match
  const exact = await query<ProductRow>(
    `SELECT p.*, coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd
     FROM web_product_core p
     WHERE lower(p.brand_name_en) = lower(?) AND lower(p.product_name) = lower(?)
     LIMIT 1`,
    [brand, product],
  );
  if (exact.length > 0) return exact[0];

  // 2. Brand exact + product LIKE (shortest name first)
  const like = await query<ProductRow>(
    `SELECT p.*, coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd
     FROM web_product_core p
     WHERE lower(p.brand_name_en) = lower(?) AND lower(p.product_name) LIKE ('%' || lower(?) || '%')
     ORDER BY length(p.product_name)
     LIMIT 1`,
    [brand, product],
  );
  if (like.length > 0) return like[0];

  // 3. Brand fuzzy (also check manufacturer_name_en)
  const fuzzy = await query<ProductRow>(
    `SELECT p.*, coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd
     FROM web_product_core p
     WHERE (lower(p.brand_name_en) = lower(?) OR lower(p.manufacturer_name_en) = lower(?))
       AND lower(p.product_name) LIKE ('%' || lower(?) || '%')
     ORDER BY length(p.product_name)
     LIMIT 1`,
    [brand, brand, product],
  );
  if (fuzzy.length > 0) return fuzzy[0];

  // 4. Normalized match — strip spaces/hyphens and compare as a substring
  //    e.g. query "D90III" matches DB "D90 III Sabre" because both normalize to contain "d90iii"
  const candidates = await query<ProductRow>(
    `SELECT p.*, coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd
     FROM web_product_core p
     WHERE lower(p.brand_name_en) = lower(?) OR lower(p.manufacturer_name_en) = lower(?)`,
    [brand, brand],
  );
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');
  const needle = norm(product);
  const matched = candidates
    .filter((r) => norm(r.product_name).includes(needle))
    .sort((a, b) => a.product_name.length - b.product_name.length);
  return matched.length > 0 ? matched[0] : null;
}

/* ── Escape helper ── */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Main render ── */

export interface EmbedSpecParams {
  brand: string;
  product: string;
  lang?: string;
  theme?: string;
}

export async function renderEmbedSpec(
  container: HTMLElement,
  params: EmbedSpecParams,
): Promise<void> {
  const row = await findProduct(params.brand, params.product);

  if (!row) {
    const exploreUrl = `https://audiospecs.frieve.com/explore`;
    container.innerHTML = `
      <div class="embed-error">
        <div>${t('embed.error.not_found')}</div>
        <div style="font-size:12px;margin-top:4px;color:var(--embed-text-secondary)">
          ${esc(params.brand)} — ${esc(params.product)}
        </div>
        <a href="${exploreUrl}" target="_blank" rel="noopener">${t('embed.error.search_link')}</a>
      </div>`;
    return;
  }

  const brandLabel = row.brand_name_en || t('common.unknown');
  const productLabel = productDisplayName(row);
  const category = row.category_primary;
  const categoryLabel = getCategoryLabel(category);
  const productId = row.product_id;

  // Filter fields: non-split mode (show "best" values only), hide nulls
  const allFields = filterFieldsForSplitMode(getSpecFields(), false);
  const visibleFields = allFields.filter((f) => row[f.key] != null);

  // Fetch global min/max for bar rendering (same approach as compare.ts)
  const numericKeys = visibleFields
    .filter((f) => typeof row[f.key] === 'number')
    .map((f) => f.key);
  const globalRange: Record<string, { min: number; max: number }> = {};
  if (numericKeys.length > 0) {
    const minMaxExprs = numericKeys.map((k) => {
      const src = k === 'price_anchor_usd' ? 'coalesce(street_price_usd, msrp_usd)' : k;
      return `MIN(${src}) as "min_${k}", MAX(${src}) as "max_${k}"`;
    }).join(', ');
    const [stats] = await query<Record<string, number>>(
      `SELECT ${minMaxExprs} FROM web_product_core`,
    );
    for (const k of numericKeys) {
      const mn = stats[`min_${k}`];
      const mx = stats[`max_${k}`];
      if (mn != null && mx != null) globalRange[k] = { min: mn, max: mx };
    }
  }

  // ── FR chart (if data exists) ──
  const hasFr = row.has_fr_data === 1;
  let frHtml = '';
  if (hasFr) {
    frHtml = `
      <div class="embed-fr-section">
        <h3 class="embed-fr-title">${esc(t('compare.fr.title'))}</h3>
        <div id="embed-fr-sources" class="embed-fr-sources"></div>
        <div id="embed-fr-plot" style="width:100%;height:280px"></div>
        <div id="embed-fr-narration" class="fr-narration"></div>
      </div>`;
  }

  // Build spec rows — each value cell carries data-product-id and data-col
  // for the source context menu (right-click / long-press).
  // Label cells include a ? help icon with axis description tooltip.
  // Numeric cells show a background bar indicating relative position in the DB range.
  const rowsHtml = visibleFields.map((f) => {
    const v = row[f.key];
    const formatted = f.format(v);
    const badge = isRowValueMeasured(row, f.key) ? ' ' + measuredBadgeSvg() : '';
    // Axis description tooltip (same keys as Compare page)
    const descKey = `axisdesc.${f.key}`;
    const desc = t(descKey);
    const helpIcon = desc !== descKey ? ` <span class="col-help" data-tooltip="${esc(desc)}">?</span>` : '';

    // Bar rendering for numeric values
    const range = globalRange[f.key];
    let barAttr = '';
    if (typeof v === 'number' && range) {
      const scale = getScaleForField(f.key);
      const pct = computeBarPercent(v, range.min, range.max, scale);
      barAttr = ` class="embed-value-cell bar-cell" style="--bar-pct:${pct.toFixed(1)}"`;
    } else {
      barAttr = ' class="embed-value-cell"';
    }

    return `<tr>
      <td>${esc(t(f.labelKey))}${helpIcon}</td>
      <td${barAttr} data-product-id="${esc(productId)}" data-col="${esc(f.key)}">${esc(formatted)}${badge}</td>
    </tr>`;
  }).join('');

  // Compact fields (extended attributes)
  const compactRowsHtml = getExtendedCompactFields()
    .filter((cf) => isCompactFieldVisible(cf, row))
    .map((cf) => {
      const html = cf.formatRow(row);
      if (html == null) return '';
      const colIds = JSON.stringify(cf.sourceKeys);
      return `<tr>
        <td>${esc(t(cf.labelKey))}</td>
        <td class="embed-value-cell embed-compact-cell" data-product-id="${esc(productId)}" data-compact-cols='${esc(colIds)}'>${html}</td>
      </tr>`;
    }).join('');

  // Interaction hint (same modality detection as the main app)
  const hintKey = getInteractionHintKey();
  const hintText = t(hintKey);

  // Product detail link (slugified brand + product name)
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const compareUrl = `https://audiospecs.frieve.com/product/${slug(brandLabel)}/${slug(productLabel)}`;
  const openText = t('embed.open_in_audiospecs');
  const poweredText = 'Powered by AudioSpecs';

  container.innerHTML = `
    <div class="embed-header">
      <span class="embed-category-badge" data-cat="${esc(category)}">${esc(categoryLabel)}</span>
      <div class="embed-brand">${esc(brandLabel)}</div>
      <div class="embed-product">${esc(productLabel)}</div>
    </div>
    ${frHtml}
    <div class="embed-data-section">
      <h3 class="embed-section-title">${esc(t('embed.related_data'))}</h3>
      <div class="embed-hint">${esc(hintText)}</div>
      <table class="embed-spec-table">
        <tbody>${rowsHtml}${compactRowsHtml}</tbody>
      </table>
    </div>
    <div class="embed-footer">
      <a class="embed-open-link" href="${compareUrl}" target="_blank" rel="noopener">${esc(openText)}</a>
      <div class="embed-powered">${poweredText}</div>
    </div>`;

  // Wire up field description tooltips (? help icons)
  setupColHelpTooltips(container);

  // Wire up measured badge tooltips
  setupMeasuredBadgeTooltips(container);

  // Wire up source context menu (right-click / long-press) on value cells
  setupSourceContextMenu(container);
  setupSourceMenuDismiss();

  // ── Render FR chart ──
  if (hasFr) {
    const frRows = await query<{ product_id: string; series_type: string; points_json: string }>(
      `SELECT product_id, series_type, points_json FROM web_fr_data WHERE product_id = ?`,
      [productId],
    );
    const fr = frRows.find((r) => r.series_type === 'raw') ?? frRows[0];
    if (fr) {
      const rawPoints: [number, number][] = JSON.parse(fr.points_json);
      const points = applyFrOffset(rawPoints, computeFrOffset(rawPoints, category));

      const narration = analyzeFR(rawPoints, category);

      const interpFrY = (pts: [number, number][], freq: number): number => {
        if (freq <= pts[0][0]) return pts[0][1];
        if (freq >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
        let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (pts[mid][0] <= freq) lo = mid; else hi = mid;
        }
        const [f0, v0] = pts[lo], [f1, v1] = pts[hi];
        return v0 + (Math.log(freq / f0) / Math.log(f1 / f0)) * (v1 - v0);
      };

      const PEAK_DIP_OFFSET_DB = 1.2;
      const makePeakDipTraces = (pds: PeakDipResult[], pts: [number, number][], borderColor: string): Data[] => {
        const fmtHz = (hz: number) => hz < 1000 ? `${hz.toFixed(0)} Hz` : `${(hz / 1000).toFixed(2)} kHz`;
        const peaks = pds.filter(pd => pd.kind === 'peak');
        const dips  = pds.filter(pd => pd.kind === 'dip');
        const makeTrace = (
          items: PeakDipResult[], label: string, symbol: string, color: string, yOffset: number,
        ): Data => ({
          x: items.map(pd => pd.fcHz),
          y: items.map(pd => interpFrY(pts, pd.fcHz) + yOffset),
          type: 'scatter',
          mode: 'markers',
          name: label,
          marker: { symbol, color, size: 10, line: { color: borderColor, width: 1 } } as Data['marker'],
          customdata: items.map(pd =>
            `${label} ${fmtHz(pd.fcHz)}<br>prom=${pd.prominenceDb.toFixed(1)} dB, w=${pd.widthOct.toFixed(2)} oct`
          ),
          hovertemplate: '%{customdata}<extra></extra>',
        });
        return [
          makeTrace(peaks, 'Peak', 'triangle-down', '#ef4444', +PEAK_DIP_OFFSET_DB),
          makeTrace(dips,  'Dip',  'triangle-up',   '#3b82f6', -PEAK_DIP_OFFSET_DB),
        ];
      };

      const productTrace: Data = {
        x: points.map((p) => p[0]),
        y: points.map((p) => p[1]),
        customdata: points.map((p) => `${formatDbSigned(p[1])} dB`),
        type: 'scatter',
        mode: 'lines',
        name: `${brandLabel} ${productLabel}`,
        line: { color: '#7c3aed', width: 1.5 },
        hovertemplate: '%{fullData.name}: %{customdata}<extra></extra>',
      };
      const targetTrace = buildTargetTrace(category);
      const cc = embedChartColors();
      const pdTraces = makePeakDipTraces(narration.allPeaksDips, points, cc.paper_bgcolor);
      const layout: Partial<Layout> = {
        xaxis: {
          title: { text: t('compare.fr.xaxis'), font: { family: 'sans-serif', size: 12, color: cc.axisTitleColor }, standoff: 8 },
          type: 'log',
          hoverformat: '.3~s',
          gridcolor: cc.gridcolor,
          zerolinecolor: cc.zerolinecolor,
        } as Partial<Layout>['xaxis'],
        yaxis: {
          title: { text: t('compare.fr.yaxis_abs'), font: { family: 'sans-serif', size: 12, color: cc.axisTitleColor }, standoff: 8 },
          range: [-24, 18] as [number, number],
          dtick: 6,
          tickformat: '+d',
          gridcolor: cc.gridcolor,
          zerolinecolor: cc.zerolinecolor,
        } as Partial<Layout>['yaxis'],
        paper_bgcolor: cc.paper_bgcolor,
        plot_bgcolor: cc.plot_bgcolor,
        font: { family: 'sans-serif', size: 11, ...(cc.fontColor ? { color: cc.fontColor } : {}) },
        margin: { l: 50, r: 16, t: 8, b: 45 },
        showlegend: true,
        legend: { orientation: 'h', y: -0.25, font: { size: 10 } },
        hovermode: 'x unified',
      };

      const plotConfig: Partial<Config> = {
        responsive: true,
        displayModeBar: false,
        staticPlot: false,
      };

      await Plotly.react('embed-fr-plot', [productTrace, targetTrace, ...pdTraces], layout, plotConfig);

      // Rewrite unified hover header to show formatted frequency
      const embedPlotEl = document.getElementById('embed-fr-plot');
      if (embedPlotEl) {
        (embedPlotEl as any).on('plotly_hover', (ev: any) => {
          if (!ev?.points?.[0]) return;
          requestAnimationFrame(() => {
            const hdr = embedPlotEl.querySelector('.hoverlayer .legend text');
            if (hdr?.firstElementChild) hdr.firstElementChild.textContent = formatHzUnit(ev.points[0].x);
          });
        });
      }

      // FR narration
      const frNarrationEl = container.querySelector<HTMLElement>('#embed-fr-narration');
      if (frNarrationEl) {
        try {
          const period = getLocale() === 'ja' ? '。' : '.';
          const addDot = (s: string) => (s.endsWith('。') || s.endsWith('.')) ? s : s + period;
          let html = '';

          if (narration.summaryParagraphs.length > 0) {
            html += `<h4 class="fr-narration-section-label">${esc(t('fr.section.summary'))}</h4>`;
            html += `<div class="fr-narration-summary">`;
            const sentSep = getLocale() === 'ja' ? '' : ' ';
            html += `<p class="fr-narration-para">${narration.summaryParagraphs.map(p => esc(addDot(p))).join(sentSep)}</p>`;
            html += `</div>`;
          }

          if (narration.bandNarrations.length > 0) {
            html += `<h4 class="fr-narration-section-label">${esc(t('fr.section.bands'))}</h4>`;
            html += `<div class="fr-narration-bands">`;

            const GW = 120, GH = 16, CY = 8;
            let svgLines = `<line class="fr-gauge-center" x1="0" y1="${CY}" x2="${GW}" y2="${CY}" stroke-width="1"/>`;
            for (let i = 0; i <= 20; i++) {
              const x = i * 6;
              const isLong = i % 5 === 0;
              const y1 = isLong ? 2 : 5, y2 = isLong ? 14 : 11;
              svgLines += `<line class="${isLong ? 'fr-gauge-tick-long' : 'fr-gauge-tick-short'}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke-width="1"/>`;
            }
            const GAUGE_SVG = `<svg class="fr-gauge-svg" viewBox="0 0 ${GW} ${GH}" xmlns="http://www.w3.org/2000/svg">${svgLines}</svg>`;

            for (const b of narration.bandNarrations) {
              const v = b.valueDb;
              const sign = v >= 0 ? '+' : '';
              const db = `${sign}${v.toFixed(1)} dB`;
              const signClass = v > 0 ? 'fr-band-pos' : v < 0 ? 'fr-band-neg' : 'fr-band-zero';
              const vc = Math.max(-10, Math.min(10, v));
              const barLeft = v >= 0 ? 50 : 50 + vc * 5;
              const barWidth = Math.abs(vc) * 5;
              const opacityMap = { neutral: 0, slight: 0.35, clear: 0.55, severe: 0.75 };
              const barOpacity = opacityMap[b.severity];
              const rgb = v >= 0 ? '200,50,50' : '50,80,210';
              const barStyle = `left:${barLeft.toFixed(1)}%;width:${barWidth.toFixed(1)}%;background:rgba(${rgb},${barOpacity})`;
              const checkmark = b.severity === 'neutral' ? '✅ ' : '';
              html += `<div class="fr-band-row fr-band-sev-${b.severity} ${signClass}">`;
              html += `<span class="fr-band-label">${esc(b.label)}</span>`;
              html += `<span class="fr-band-value"><span class="fr-gauge-wrap"><span class="fr-gauge-bar" style="${barStyle}"></span>${GAUGE_SVG}</span><span class="fr-band-num">${esc(db)}</span></span>`;
              html += `<span class="fr-band-text">${checkmark}${esc(addDot(b.text))}</span>`;
              html += `</div>`;
            }

            html += `</div>`;
            html += `<p class="fr-narration-note">${esc(t('fr.note'))}</p>`;
          }

          if (html) frNarrationEl.innerHTML = html;
        } catch {
          // narration is best-effort — silently ignore errors
        }
      }
    }

    // Populate FR source URLs
    const frSourcesEl = container.querySelector<HTMLElement>('#embed-fr-sources');
    if (frSourcesEl) {
      frSourcesEl.textContent = '…';
      fetchSourceUrls(productId, ['fr_data']).then((urls) => {
        if (!document.body.contains(frSourcesEl)) return;
        if (urls.length === 0) { frSourcesEl.textContent = ''; return; }
        frSourcesEl.textContent = '';
        const label = document.createElement('span');
        label.textContent = t('compare.fr.sources') + ': ';
        label.style.fontWeight = '600';
        frSourcesEl.appendChild(label);
        let first = true;
        for (const url of urls) {
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

  // Notify parent of content height for auto-resize
  notifySize();
  observeSize();
}

/** Detect input modality and return the i18n key for the interaction hint. */
function getInteractionHintKey(): string {
  const mm = (q: string): boolean => {
    try { return window.matchMedia(q).matches; } catch { return false; }
  };
  const primaryFine = mm('(pointer: fine)');
  const anyHover = mm('(any-hover: hover)');
  const hasTouch =
    mm('(any-pointer: coarse)') ||
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0;
  if (primaryFine && anyHover) return 'embed.hint.mouse';
  if (hasTouch && primaryFine) return 'embed.hint.hybrid';
  if (hasTouch) return 'embed.hint.touch';
  return 'embed.hint.hybrid';
}

/** Wire up right-click / long-press source context menu on value cells. */
function setupSourceContextMenu(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.embed-value-cell[data-product-id][data-col]').forEach((cell) => {
    // Right-click
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showSourceMenu(e.clientX, e.clientY, cell.dataset.productId!, [cell.dataset.col!]);
    });
    // Long-press (touch)
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

  // Compact cells (sourceKeys stored in data attribute)
  container.querySelectorAll<HTMLElement>('.embed-compact-cell[data-product-id][data-compact-cols]').forEach((cell) => {
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
}

/** Post content dimensions to the parent window for iframe auto-resize. */
function notifySize(): void {
  try {
    const height = document.documentElement.scrollHeight;
    const width = document.documentElement.scrollWidth;
    window.parent.postMessage({ type: 'audiospecs-embed-resize', height, width }, '*');
  } catch {
    // ignore if cross-origin parent blocks postMessage
  }
}

// Observe body size changes (tooltips, source menus, dynamic content)
let sizeObserver: ResizeObserver | null = null;
function observeSize(): void {
  if (sizeObserver) return;
  sizeObserver = new ResizeObserver(() => notifySize());
  sizeObserver.observe(document.documentElement);
}

// Also notify on window resize
window.addEventListener('resize', () => notifySize());
