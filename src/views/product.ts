/**
 * Single product detail page.
 *
 * Renders the same spec table / FR chart as the embed-spec widget,
 * but inside the full site shell (header + footer).
 * URL format: /product/{brand}/{product}
 */

import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { query } from '../db/database';
import { getCategoryLabel, getAxis, getScaleForField, computeBarPercent, productDisplayName } from '../presets';
import { t, getLocale } from '../i18n';
import { isRowValueMeasured, measuredBadgeSvg, setupMeasuredBadgeTooltips } from '../components/measured-indicator';
import { setupColHelpTooltips } from '../components/col-help';
import { showSourceMenu, setupSourceMenuDismiss, fetchSourceUrls, fetchAllSourceUrls } from '../sources';
import { getExtendedCompactFields, isCompactFieldVisible, escHtml as _escHtml, sig3 as _sig3, formatHz as _formatHz, formatHzUnit, formatDbSigned } from '../format-utils';
import { chartColors } from '../theme';
import { navigate } from '../router';
import { getRankingAxes, buildRankingData, createRankingSection } from '../components/ranking-bar-widget';
import { buildTargetTrace, rawToDeviation } from '../target-curves';

/* ── Helpers (re-exported from format-utils) ── */

const sig3 = _sig3;
const formatHz = _formatHz;
const escHtml = _escHtml;

/* ── Field definitions (same as compare / embed-spec) ── */

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
 * Filter fields for split spec/measured mode.
 * In non-split mode: hide _measured/_spec variants whose base also exists.
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

/* ── Product lookup (same 4-level fallback as embed-spec) ── */

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
 * Find a product by brand + product slug with progressive fallback:
 * 1. Exact match on brand_name_en + product_name (case-insensitive)
 * 2. Brand exact + product LIKE (shortest name wins)
 * 3. Also search manufacturer_name_en for brand
 * 4. Slug-normalized match — slugify both DB values and query, compare
 */
async function findProduct(brand: string, product: string): Promise<ProductRow | null> {
  // Try exact match first (works when params are raw names, e.g. from ?id= fallback)
  const exact = await query<ProductRow>(
    `SELECT p.*, coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd
     FROM web_product_core p
     WHERE lower(p.brand_name_en) = lower(?) AND lower(p.product_name) = lower(?)
     LIMIT 1`,
    [brand, product],
  );
  if (exact.length > 0) return exact[0];

  // Slug-based matching: compare slugified DB values against the slugified params
  const brandSlug = slugify(brand);
  const productSlug = slugify(product);

  // Fetch all products from matching brand (by slug) for client-side slug comparison
  const candidates = await query<ProductRow>(
    `SELECT p.*, coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd
     FROM web_product_core p`,
  );

  // 1. Exact slug match on brand + product
  const exactSlug = candidates.find(
    (r) => slugify(r.brand_name_en) === brandSlug && slugify(r.product_name) === productSlug,
  );
  if (exactSlug) return exactSlug;

  // 2. Brand slug match + product slug contains
  const brandMatches = candidates.filter(
    (r) => slugify(r.brand_name_en) === brandSlug || slugify(r.manufacturer_name_en || '') === brandSlug,
  );
  const contains = brandMatches
    .filter((r) => slugify(r.product_name).includes(productSlug))
    .sort((a, b) => a.product_name.length - b.product_name.length);
  if (contains.length > 0) return contains[0];

  // 3. Reverse: product slug contains the query slug (handles truncated slugs)
  const reverse = brandMatches
    .filter((r) => productSlug.includes(slugify(r.product_name)))
    .sort((a, b) => b.product_name.length - a.product_name.length);
  if (reverse.length > 0) return reverse[0];

  return null;
}

async function findProductById(productId: string): Promise<ProductRow | null> {
  const rows = await query<ProductRow>(
    `SELECT p.*, coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd
     FROM web_product_core p WHERE p.product_id = ? LIMIT 1`,
    [productId],
  );
  return rows.length > 0 ? rows[0] : null;
}

/* ── URL helpers ── */

/**
 * Convert a string to a URL-safe slug: lowercase, replace non-alphanum with
 * hyphens, collapse consecutive hyphens, trim leading/trailing hyphens.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Build a product detail page URL from brand + product names. */
export function productPageUrl(brand: string, productName: string): string {
  return `/product/${slugify(brand)}/${slugify(productName)}`;
}

/** Build a product detail page URL from a row object. */
export function productPageUrlFromRow(row: { brand_name_en?: string; brand_label?: string; product_name: string }): string {
  const brand = (row.brand_name_en || row.brand_label || 'unknown').toString();
  return productPageUrl(brand, row.product_name);
}

/* ── Main render ── */

export async function renderProduct(
  container: HTMLElement,
  params: URLSearchParams,
): Promise<void> {
  // Resolve product: prefer id param, then brand/product from path
  const productId = params.get('id');
  const brandParam = params.get('brand') || '';
  const productParam = params.get('product') || '';

  let row: ProductRow | null = null;
  if (productId) {
    row = await findProductById(productId);
  }
  if (!row && brandParam && productParam) {
    row = await findProduct(brandParam, productParam);
  }

  if (!row) {
    container.innerHTML = `
      <div class="view-header">
        <h1>${t('product.title')}</h1>
      </div>
      <div class="card">
        <div class="card-body" style="text-align:center;padding:3rem">
          <p>${t('product.not_found')}</p>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.5rem">
            ${escHtml(brandParam)} — ${escHtml(productParam)}
          </p>
          <a href="/explore" style="margin-top:1rem;display:inline-block">${t('product.back_to_explore')}</a>
        </div>
      </div>`;
    return;
  }

  // Canonical URL: replace state to use the resolved brand/product names
  const canonicalUrl = productPageUrl(
    row.brand_name_en || 'unknown',
    row.product_name,
  );
  if (window.location.pathname !== canonicalUrl) {
    history.replaceState(null, '', canonicalUrl);
  }

  const brandLabel = row.brand_name_en || t('common.unknown');
  const productLabel = productDisplayName(row);
  const category = row.category_primary;
  const categoryLabel = getCategoryLabel(category);
  const pid = row.product_id;

  // Update page title
  document.title = `${brandLabel} ${productLabel} — Frieve - AudioSpecs`;

  // Filter fields: non-split mode (show "best" values only), hide nulls
  const allFields = filterFieldsForSplitMode(getSpecFields(), false);
  const visibleFields = allFields.filter((f) => row![f.key] != null);

  // Fetch global min/max for bar rendering
  const numericKeys = visibleFields
    .filter((f) => typeof row![f.key] === 'number')
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
      <div class="card" style="margin-bottom:1rem">
        <div class="card-body">
          <h3 style="margin:0 0 0.5rem">${escHtml(t('compare.fr.title'))}</h3>
          <span class="fr-toggles"><span class="fr-toggle-group"><label class="fr-target-toggle"><input type="checkbox" id="product-fr-target-cb" checked> ${escHtml(t('compare.fr.target_curve'))}</label><span class="col-help" data-tooltip="${escHtml(t('compare.fr.target_curve_tip'))}">?</span></span>
          <span class="fr-toggle-group"><label class="fr-target-toggle"><input type="checkbox" id="product-fr-deviation-cb"> ${escHtml(t('compare.fr.deviation'))}</label><span class="col-help" data-tooltip="${escHtml(t('compare.fr.deviation_tip'))}">?</span></span></span>
          <div id="product-fr-plot" style="width:100%;height:400px;overflow:hidden"></div>
          <div id="product-fr-sources" class="fr-sources-row" style="margin-top:0.5rem;font-size:13px;color:var(--text-secondary, #666)"></div>
        </div>
      </div>`;
  }

  // Build spec rows
  const rowsHtml = visibleFields.map((f) => {
    const v = row![f.key];
    const formatted = f.format(v);
    const badge = isRowValueMeasured(row!, f.key) ? ' ' + measuredBadgeSvg() : '';
    const descKey = `axisdesc.${f.key}`;
    const desc = t(descKey);
    const helpIcon = desc !== descKey ? ` <span class="col-help" data-tooltip="${escHtml(desc)}">?</span>` : '';
    const range = globalRange[f.key];
    let barAttr = '';
    if (typeof v === 'number' && range) {
      const scale = getScaleForField(f.key);
      const pct = computeBarPercent(v, range.min, range.max, scale);
      barAttr = ` class="product-value-cell bar-cell" style="--bar-pct:${pct.toFixed(1)}"`;
    } else {
      barAttr = ' class="product-value-cell"';
    }
    return `<tr>
      <td class="product-label-cell">${escHtml(t(f.labelKey))}${helpIcon}</td>
      <td${barAttr} data-product-id="${escHtml(pid)}" data-col="${escHtml(f.key)}">${escHtml(formatted)}${badge}</td>
    </tr>`;
  }).join('');

  // Compact fields (extended attributes)
  const compactRowsHtml = getExtendedCompactFields()
    .filter((cf) => isCompactFieldVisible(cf, row!))
    .map((cf) => {
      const html = cf.formatRow(row!);
      if (html == null) return '';
      const colIds = JSON.stringify(cf.sourceKeys);
      return `<tr>
        <td class="product-label-cell">${escHtml(t(cf.labelKey))}</td>
        <td class="product-value-cell product-compact-cell" data-product-id="${escHtml(pid)}" data-compact-cols='${escHtml(colIds)}'>${html}</td>
      </tr>`;
    }).join('');

  // Search URLs
  const searchQuery = `${brandLabel} ${row.product_name}`.trim();
  const lang = getLocale() === 'ja' ? 'ja' : 'en';
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
  const frieveQ = searchQuery.split(/\s+/).map(encodeURIComponent).join('+');
  const frieveUrl = `https://audioreview.frieve.com/search/${lang}/?q=${frieveQ}`;
  const amazonUrl = getLocale() === 'ja'
    ? `https://www.amazon.co.jp/s?k=${encodeURIComponent(searchQuery)}&tag=frieve02-22`
    : `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}&tag=frieve-20`;

  // Interaction hint
  const hintKey = getInteractionHintKey();
  const hintText = t(hintKey);

  // SVG icons (same as compare/explore)
  const googleSvg = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
  const amazonSvg = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6.61 11.802c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02z"/><path fill="#FF9900" d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13z"/><path fill="#FF9900" d="M19.525 18.448c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z"/></svg>';

  container.innerHTML = `
    <div class="view-header product-header">
      <h1>${escHtml(brandLabel)} <span class="product-header-name">${escHtml(productLabel)}</span> <span class="chip cat-${escHtml(category)}">${escHtml(categoryLabel)}</span></h1>
    </div>
    <div class="product-actions">
      <button id="product-add-compare">+ ${escHtml(t('product.add_to_compare'))}</button>
      <a href="${googleUrl}" target="_blank" rel="noopener" class="product-search-link">${googleSvg} ${escHtml(t('analysis.ctx.search_google'))}</a>
      <a href="${frieveUrl}" target="_blank" rel="noopener" class="product-search-link">\u{1F3A7} ${escHtml(t('analysis.ctx.search_frieve'))}</a>
      <a href="${amazonUrl}" target="_blank" rel="noopener" class="product-search-link">${amazonSvg} ${escHtml(t('analysis.ctx.search_amazon'))}</a>
    </div>
    ${frHtml}
    <div class="card">
      <div class="card-body">
        <h3 style="margin:0 0 0.5rem">${escHtml(t('product.specifications'))}</h3>
        <div class="product-hint">${escHtml(hintText)}</div>
        <div class="product-spec-table-wrap">
          <table class="product-spec-table">
            <tbody>
              ${rowsHtml}${compactRowsHtml}
              <tr>
                <td class="product-label-cell">${escHtml(t('compare.field.sources'))}</td>
                <td class="product-value-cell" id="product-all-sources">…</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div id="product-ranking-section"></div>
  `;

  // ── Add to compare button ──
  document.getElementById('product-add-compare')!.addEventListener('click', () => {
    let ids: string[] = [];
    try { ids = JSON.parse(sessionStorage.getItem('compare_ids') || '[]'); } catch { /* empty */ }
    if (!ids.includes(pid)) {
      if (ids.length >= 20) return;
      ids.push(pid);
      sessionStorage.setItem('compare_ids', JSON.stringify(ids));
    }
    navigate('compare', { ids: ids.join(',') });
  });

  // ── Tooltips ──
  setupColHelpTooltips(container);
  setupMeasuredBadgeTooltips(container);

  // ── Source context menu on value cells ──
  setupSourceContextMenu(container);
  setupSourceMenuDismiss();

  // ── Render FR chart ──
  if (hasFr) {
    const frRows = await query<{ product_id: string; series_type: string; points_json: string }>(
      `SELECT product_id, series_type, points_json FROM web_fr_data WHERE product_id = ?`,
      [pid],
    );
    const fr = frRows.find((r) => r.series_type === 'raw') ?? frRows[0];
    if (fr) {
      const rawPoints: [number, number][] = JSON.parse(fr.points_json);
      const devPoints = rawToDeviation(rawPoints, category);
      const targetTrace = buildTargetTrace(category);

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
        showlegend: true,
        legend: { orientation: 'h', y: -0.2, font: { size: 11 * fontScale } },
        hovermode: 'x unified',
      };

      const plotConfig: Partial<Config> = {
        responsive: true,
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        displaylogo: false,
        toImageButtonOptions: { scale: 2 },
      };

      const makeFrTrace = (pts: [number, number][], color: string, name: string): Data => ({
        x: pts.map((p) => p[0]),
        y: pts.map((p) => p[1]),
        customdata: pts.map((p) => `${formatDbSigned(p[1])} dB`),
        type: 'scatter',
        mode: 'lines',
        name,
        line: { color, width: 1.5 },
        hovertemplate: '%{fullData.name}: %{customdata}<extra></extra>',
      });

      const renderFrPlot = (showTarget: boolean, showDeviation: boolean) => {
        const pts = showDeviation ? devPoints : rawPoints;
        const productTrace = makeFrTrace(pts, '#7c3aed', `${brandLabel} ${productLabel}`);
        const yTitle = showDeviation ? t('compare.fr.yaxis') : t('compare.fr.yaxis_abs');
        const yRange: [number, number] = showDeviation ? [-12, 12] : [-24, 18];
        const yDtick = showDeviation ? 3 : 6;
        const layout = {
          ...baseLayout,
          yaxis: { ...baseLayout.yaxis, range: yRange, dtick: yDtick, title: { text: yTitle, font: { family: 'Inter, sans-serif', size: 13 * fontScale, color: cc.axisTitleColor }, standoff: 10 * fontScale } },
        };
        if (showDeviation) {
          const zeroTrace: Data = {
            x: [rawPoints[0][0], rawPoints[rawPoints.length - 1][0]],
            y: [0, 0],
            type: 'scatter',
            mode: 'lines',
            name: 'Target (0 dB)',
            line: { color: 'rgba(150,150,150,0.5)', width: 2, dash: 'dot' },
            hoverinfo: 'skip',
            showlegend: true,
          };
          Plotly.react('product-fr-plot', [zeroTrace, productTrace], layout, plotConfig);
        } else {
          const traces = showTarget ? [productTrace, targetTrace] : [productTrace];
          Plotly.react('product-fr-plot', traces, layout, plotConfig);
        }
      };

      renderFrPlot(true, false);

      // Rewrite unified hover header to show formatted frequency
      const frPlotEl = document.getElementById('product-fr-plot');
      if (frPlotEl) {
        (frPlotEl as any).on('plotly_hover', (ev: any) => {
          if (!ev?.points?.[0]) return;
          requestAnimationFrame(() => {
            const hdr = frPlotEl.querySelector('.hoverlayer .legend text');
            if (hdr?.firstElementChild) hdr.firstElementChild.textContent = formatHzUnit(ev.points[0].x);
          });
        });
      }

      // Wire up toggles
      const targetCb = container.querySelector<HTMLInputElement>('#product-fr-target-cb');
      const devCb = container.querySelector<HTMLInputElement>('#product-fr-deviation-cb');
      const updateFrPlot = () => {
        const showDev = devCb?.checked ?? false;
        const showTarget = targetCb?.checked ?? true;
        if (targetCb) targetCb.disabled = showDev;
        renderFrPlot(showTarget, showDev);
      };
      if (targetCb) targetCb.addEventListener('change', updateFrPlot);
      if (devCb) devCb.addEventListener('change', updateFrPlot);
    }

    // FR source URLs
    const frSourcesEl = container.querySelector<HTMLElement>('#product-fr-sources');
    if (frSourcesEl) {
      frSourcesEl.textContent = '…';
      fetchSourceUrls(pid, ['fr_data']).then((urls) => {
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

  // ── All source URLs (same rendering as Compare tab) ──
  const allSourcesEl = container.querySelector<HTMLElement>('#product-all-sources');
  if (allSourcesEl) {
    fetchAllSourceUrls(pid).then((urls) => {
      if (!document.body.contains(allSourcesEl)) return;
      if (urls.length === 0) { allSourcesEl.textContent = '—'; return; }
      allSourcesEl.textContent = '';
      for (const url of urls) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        try { a.textContent = new URL(url).hostname; } catch { a.textContent = url; }
        a.title = url;
        allSourcesEl.appendChild(a);
      }
    }).catch(() => {
      if (document.body.contains(allSourcesEl)) allSourcesEl.textContent = '—';
    });
  }

  // ── Ranking bar charts ──
  const rankingSectionEl = container.querySelector<HTMLElement>('#product-ranking-section');
  if (rankingSectionEl) {
    // Fetch all products in the same category for ranking
    const categoryProducts = await query<Record<string, unknown>>(
      `SELECT p.*,
        coalesce(p.street_price_usd, p.msrp_usd) AS price_anchor_usd,
        CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END AS brand_label
      FROM web_product_core p
      WHERE p.category_primary = ?`,
      [category],
    );

    const rankingAxes = getRankingAxes(false);
    const highlights = new Map<string, string>();
    highlights.set(pid, '#dc2626');

    createRankingSection(
      rankingSectionEl,
      rankingAxes,
      categoryProducts,
      highlights,
      t('product.rankings'),
    );
  }
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
  container.querySelectorAll<HTMLElement>('.product-value-cell[data-product-id][data-col]').forEach((cell) => {
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

  container.querySelectorAll<HTMLElement>('.product-compact-cell[data-product-id][data-compact-cols]').forEach((cell) => {
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
