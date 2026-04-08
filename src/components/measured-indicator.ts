/**
 * Small gauge SVG badge shown next to a numeric value when that value is a
 * third-party measurement rather than a manufacturer-declared spec.
 *
 * Only applied to multi-source base columns (those with both `_measured`
 * and `_spec` sibling variants) where the displayed value is ambiguous
 * without the badge. Columns that are always measured or always spec
 * don't need the badge.
 */
import { axisHasSourceVariants, getAxisSourceKind } from '../presets';
import { t } from '../i18n';

/** True if `key` is a multi-source base column (not a `_measured`/`_spec` variant itself). */
export function isMultiSourceBaseKey(key: string): boolean {
  if (key.endsWith('_measured') || key.endsWith('_spec')) return false;
  return axisHasSourceVariants(key);
}

/**
 * True if values in `key` are always third-party measurements regardless of row
 * content (e.g. FR deviation metrics, preference scores, and all
 * explicit `_measured` variant columns).
 */
export function isAlwaysMeasuredKey(key: string): boolean {
  if (key.endsWith('_measured')) return true;
  if (key.endsWith('_spec')) return false;
  return getAxisSourceKind(key) === 'measured';
}

/** Column alias prefix used to carry the `_measured` sibling value alongside a base column in query results. */
export const MEASURED_FLAG_PREFIX = '__msd_';

/**
 * Build a SELECT fragment that exposes the `_measured` sibling value for a
 * multi-source base column, aliased as `__msd_<key>`. Returns '' for
 * non-multi-source keys.
 */
export function measuredFlagSelect(baseKey: string, tableAlias = 'p'): string {
  if (!isMultiSourceBaseKey(baseKey)) return '';
  return `, ${tableAlias}.${baseKey}_measured AS ${MEASURED_FLAG_PREFIX}${baseKey}`;
}

/**
 * True if the row's displayed value for `key` is a third-party measurement.
 * Covers always-measured axes, explicit `_measured` variant columns, and
 * multi-source base columns whose `_measured` sibling resolved non-null.
 */
export function isRowValueMeasured(row: Record<string, unknown>, key: string): boolean {
  if (isAlwaysMeasuredKey(key)) return true;
  if (!isMultiSourceBaseKey(key)) return false;
  const direct = row[`${key}_measured`];
  if (direct !== undefined) return direct != null;
  return row[`${MEASURED_FLAG_PREFIX}${key}`] != null;
}

/**
 * Detect the user's primary input modality, using the same logic as the
 * Analysis tab's `getInteractionHint` helper, and return the i18n key for the
 * matching badge tooltip.
 */
function getMeasuredBadgeTooltipKey(): string {
  const mm = (q: string): boolean => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const primaryFine = mm('(pointer: fine)');
  const primaryCoarse = mm('(pointer: coarse)');
  const anyFine = mm('(any-pointer: fine)');
  const anyHover = mm('(any-hover: hover)');
  const hasTouch =
    mm('(any-pointer: coarse)') ||
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0;
  if (primaryFine && anyHover) return 'measured.badge.mouse';
  if (primaryCoarse && hasTouch) return 'measured.badge.touch';
  if (hasTouch && anyFine) return 'measured.badge.hybrid';
  return 'measured.badge.hybrid';
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Inline SVG gauge badge. Carries a `data-tooltip` attribute consumed by
 * `setupColHelpTooltips` — hover shows the tooltip on desktop, a single tap
 * shows it on touch devices (same UX as the `?` help icons).
 */
export function measuredBadgeSvg(): string {
  const tooltip = escAttr(t(getMeasuredBadgeTooltipKey()));
  return `<svg class="measured-badge" data-tooltip="${tooltip}" width="11" height="11" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 12 A5.5 5.5 0 0 1 13.5 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8" y1="12" x2="11" y2="6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="12" r="1.1" fill="currentColor"/></svg>`;
}

/** Returns the badge HTML if the row's base value is measured, else ''. */
export function measuredBadgeFor(row: Record<string, unknown>, baseKey: string): string {
  return isRowValueMeasured(row, baseKey) ? measuredBadgeSvg() : '';
}

/**
 * Wire up hover/tap tooltips for `.measured-badge` elements inside `container`.
 *
 * Unlike the `.col-help` setup, this does NOT `stopPropagation` on touchstart,
 * so the containing cell's long-tap timer still runs and long-pressing the
 * badge can still open the source context menu. Short taps show the tooltip
 * immediately; the popup auto-dismisses after a few seconds.
 */
export function setupMeasuredBadgeTooltips(
  container: HTMLElement,
  scrollContainer?: HTMLElement | null,
): void {
  let popup: HTMLDivElement | null = null;
  let activeBadge: Element | null = null;
  let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

  function showPopup(badge: Element): void {
    const text = (badge as HTMLElement | SVGElement).dataset.tooltip;
    if (!text) return;
    dismissPopup();
    popup = document.createElement('div');
    popup.className = 'col-help-popup';
    popup.textContent = text;
    document.body.appendChild(popup);
    activeBadge = badge;

    const rect = badge.getBoundingClientRect();
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top = rect.bottom + 6;
    if (left < 4) left = 4;
    if (left + pw > window.innerWidth - 4) left = window.innerWidth - 4 - pw;
    if (top + ph > window.innerHeight - 4) top = rect.top - ph - 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  function dismissPopup(): void {
    if (popup) { popup.remove(); popup = null; }
    activeBadge = null;
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  }

  container.querySelectorAll('.measured-badge').forEach((el) => {
    // Desktop: hover shows tooltip
    el.addEventListener('mouseenter', () => showPopup(el));
    el.addEventListener('mouseleave', () => dismissPopup());

    // Touch: tap toggles tooltip. Propagation is intentionally NOT stopped so
    // the containing cell's long-tap handler still runs and can open the
    // source context menu on long-press.
    el.addEventListener('touchstart', () => {
      if (activeBadge === el) {
        dismissPopup();
        return;
      }
      showPopup(el);
      if (autoHideTimer) clearTimeout(autoHideTimer);
      autoHideTimer = setTimeout(() => dismissPopup(), 3000);
    }, { passive: true });
  });

  scrollContainer?.addEventListener('scroll', () => dismissPopup(), { passive: true });
  document.addEventListener('touchstart', (e) => {
    if (popup && activeBadge && !activeBadge.contains(e.target as Node)) dismissPopup();
  }, { passive: true });
}
