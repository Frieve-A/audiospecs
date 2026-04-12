/**
 * Embeddable spec table renderer.
 *
 * Reuses the same field definitions and formatters as the Compare page,
 * but renders a single-product vertical spec table for iframe embedding.
 */

import { query } from '../db/database';
import { getCategoryLabel } from '../presets';
import { t } from '../i18n';
import { isRowValueMeasured, measuredBadgeSvg, setupMeasuredBadgeTooltips } from '../components/measured-indicator';
import { setupColHelpTooltips } from '../components/col-help';
import { showSourceMenu, setupSourceMenuDismiss } from '../sources';

/* ── Formatters (shared with compare.ts logic) ── */

function sig3(v: number): string {
  const n = parseFloat(v.toPrecision(3));
  if (n !== 0 && Math.abs(n) < 0.001) {
    const digits = -Math.floor(Math.log10(Math.abs(n))) + 2;
    return n.toFixed(digits);
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
    const exploreUrl = `https://audiospecs.frieve.com/#/explore`;
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
  const productLabel = row.product_name;
  const category = row.category_primary;
  const categoryLabel = getCategoryLabel(category);
  const productId = row.product_id;

  // Filter fields: non-split mode (show "best" values only), hide nulls
  const allFields = filterFieldsForSplitMode(getSpecFields(), false);
  const visibleFields = allFields.filter((f) => row[f.key] != null);

  // Build spec rows — each value cell carries data-product-id and data-col
  // for the source context menu (right-click / long-press).
  // Label cells include a ? help icon with axis description tooltip.
  const rowsHtml = visibleFields.map((f) => {
    const formatted = f.format(row[f.key]);
    const badge = isRowValueMeasured(row, f.key) ? ' ' + measuredBadgeSvg() : '';
    // Axis description tooltip (same keys as Compare page)
    const descKey = `axisdesc.${f.key}`;
    const desc = t(descKey);
    const helpIcon = desc !== descKey ? ` <span class="col-help" data-tooltip="${esc(desc)}">?</span>` : '';
    return `<tr>
      <td>${esc(t(f.labelKey))}${helpIcon}</td>
      <td class="embed-value-cell" data-product-id="${esc(productId)}" data-col="${esc(f.key)}">${esc(formatted)}${badge}</td>
    </tr>`;
  }).join('');

  // Interaction hint (same modality detection as the main app)
  const hintKey = getInteractionHintKey();
  const hintText = t(hintKey);

  // Compare link
  const compareUrl = `https://audiospecs.frieve.com/#/compare?ids=${encodeURIComponent(productId)}`;
  const openText = t('embed.open_in_audiospecs');
  const poweredText = 'Powered by AudioSpecs';

  container.innerHTML = `
    <div class="embed-header">
      <span class="embed-category-badge" data-cat="${esc(category)}">${esc(categoryLabel)}</span>
      <div class="embed-brand">${esc(brandLabel)}</div>
      <div class="embed-product">${esc(productLabel)}</div>
    </div>
    <div class="embed-hint">${esc(hintText)}</div>
    <table class="embed-spec-table">
      <tbody>${rowsHtml}</tbody>
    </table>
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

  // Notify parent of content height for auto-resize
  notifyHeight();
  observeHeight();
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
}

/** Post content height to the parent window for iframe auto-resize. */
function notifyHeight(): void {
  try {
    const height = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'audiospecs-embed-resize', height }, '*');
  } catch {
    // ignore if cross-origin parent blocks postMessage
  }
}

// Observe body size changes (tooltips, source menus, dynamic content)
let resizeObserver: ResizeObserver | null = null;
function observeHeight(): void {
  if (resizeObserver) return;
  resizeObserver = new ResizeObserver(() => notifyHeight());
  resizeObserver.observe(document.documentElement);
}

// Also notify on window resize
window.addEventListener('resize', () => notifyHeight());
