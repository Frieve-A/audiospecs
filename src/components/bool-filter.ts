/**
 * Reusable 3-state boolean filter component for Explore and Analysis views.
 *
 * Each filter cycles: any → yes → no → any
 * Renders as a compact toggle button per boolean column.
 */

import { t } from '../i18n';
import { query } from '../db/database';

/* ── Filter state type ── */

export type BoolFilterState = 'any' | 'yes' | 'no';

export interface BoolFilterDef {
  column: string;
  labelKey: string;
  group: string;
}

export interface TextFilterDef {
  column: string;
  labelKey: string;
  categories: string[];
}

/* ── Category → filter mapping ── */

const COMMON_FILTERS: BoolFilterDef[] = [
  { column: 'has_wireless', labelKey: 'filter.has_wireless', group: 'wireless' },
];

const HEADPHONE_IEM_FILTERS: BoolFilterDef[] = [
  { column: 'is_closed_back', labelKey: 'filter.is_closed_back', group: 'design' },
  { column: 'is_open_back', labelKey: 'filter.is_open_back', group: 'design' },
  { column: 'is_over_ear', labelKey: 'filter.is_over_ear', group: 'wearing' },
  { column: 'is_on_ear', labelKey: 'filter.is_on_ear', group: 'wearing' },
  { column: 'is_in_ear', labelKey: 'filter.is_in_ear', group: 'wearing' },
  { column: 'cable_is_detachable', labelKey: 'filter.cable_is_detachable', group: 'cable' },
  { column: 'cable_socket_mmcx', labelKey: 'filter.cable_socket_mmcx', group: 'cable' },
  { column: 'cable_socket_2pin', labelKey: 'filter.cable_socket_2pin', group: 'cable' },
  { column: 'cable_plug_2_5mm', labelKey: 'filter.cable_plug_2_5mm', group: 'cable' },
  { column: 'cable_plug_3_5mm', labelKey: 'filter.cable_plug_3_5mm', group: 'cable' },
  { column: 'cable_plug_4_4mm', labelKey: 'filter.cable_plug_4_4mm', group: 'cable' },
  { column: 'cable_plug_6_35mm', labelKey: 'filter.cable_plug_6_35mm', group: 'cable' },
  { column: 'has_wireless', labelKey: 'filter.has_wireless', group: 'wireless' },
  { column: 'has_anc', labelKey: 'filter.has_anc', group: 'features' },
  { column: 'has_transparency_mode', labelKey: 'filter.has_transparency_mode', group: 'features' },
  { column: 'has_app_eq', labelKey: 'filter.has_app_eq', group: 'features' },
  { column: 'is_foldable', labelKey: 'filter.is_foldable', group: 'features' },
];

const DAC_FILTERS: BoolFilterDef[] = [
  { column: 'dsd_supported', labelKey: 'filter.dsd_supported', group: 'dac' },
  { column: 'dsd_native', labelKey: 'filter.dsd_native', group: 'dac' },
  { column: 'has_input_bluetooth', labelKey: 'filter.has_input_bluetooth', group: 'connectors' },
  { column: 'has_input_usb_c', labelKey: 'filter.has_input_usb_c', group: 'connectors' },
  { column: 'has_input_optical', labelKey: 'filter.has_input_optical', group: 'connectors' },
  { column: 'has_galvanic_isolation', labelKey: 'filter.has_galvanic_isolation', group: 'features' },
  { column: 'has_preamp_mode', labelKey: 'filter.has_preamp_mode', group: 'features' },
];

const AMP_FILTERS: BoolFilterDef[] = [
  { column: 'amp_has_balanced_output', labelKey: 'filter.amp_has_balanced_output', group: 'amp' },
  { column: 'amp_is_class_a', labelKey: 'filter.amp_is_class_a', group: 'amp' },
  { column: 'amp_is_class_ab', labelKey: 'filter.amp_is_class_ab', group: 'amp' },
  { column: 'amp_is_class_d', labelKey: 'filter.amp_is_class_d', group: 'amp' },
  { column: 'power_has_usb_power', labelKey: 'filter.power_has_usb_power', group: 'power' },
  { column: 'has_remote_control', labelKey: 'filter.has_remote_control', group: 'features' },
];

/** Text filters with dynamic dropdown values. */
const TEXT_FILTERS: TextFilterDef[] = [
  { column: 'driver_type', labelKey: 'filter.driver_type', categories: ['headphone', 'iem'] },
  { column: 'dac_chip_model', labelKey: 'filter.dac_chip_model', categories: ['dac'] },
  { column: 'ip_rating', labelKey: 'filter.ip_rating', categories: ['headphone', 'iem'] },
];

/** Get boolean filter definitions for a given category. */
export function getFiltersForCategory(category: string): BoolFilterDef[] {
  if (category === 'headphone' || category === 'iem') return HEADPHONE_IEM_FILTERS;
  if (category === 'dac') return DAC_FILTERS;
  if (category === 'headphone_amp') return AMP_FILTERS;
  return COMMON_FILTERS;
}

/** Get text filter definitions applicable to the given category. */
export function getTextFiltersForCategory(category: string): TextFilterDef[] {
  return TEXT_FILTERS.filter((f) => f.categories.includes(category));
}

/** Get all text filter definitions. */
export function getAllTextFilters(): TextFilterDef[] {
  return TEXT_FILTERS;
}

/* ── Filter state management ── */

export interface FilterPanelState {
  boolFilters: Record<string, BoolFilterState>;
  textFilters: Record<string, string>;
}

export function createFilterState(): FilterPanelState {
  return { boolFilters: {}, textFilters: {} };
}

/** Parse filter state from URL params. Params format: bf_<column>=yes|no, tf_<column>=value */
export function parseFilterParams(params: URLSearchParams): FilterPanelState {
  const state = createFilterState();
  params.forEach((value, key) => {
    if (key.startsWith('bf_')) {
      const col = key.slice(3);
      if (value === 'yes' || value === 'no') state.boolFilters[col] = value;
    } else if (key.startsWith('tf_')) {
      const col = key.slice(3);
      if (value) state.textFilters[col] = value;
    }
  });
  return state;
}

/** Serialize filter state into URL params. */
export function serializeFilterParams(state: FilterPanelState): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [col, val] of Object.entries(state.boolFilters)) {
    if (val !== 'any') params[`bf_${col}`] = val;
  }
  for (const [col, val] of Object.entries(state.textFilters)) {
    if (val) params[`tf_${col}`] = val;
  }
  return params;
}

/** Build SQL WHERE conditions from filter state. Returns [conditions, params]. */
export function buildFilterConditions(state: FilterPanelState): [string[], unknown[]] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  for (const [col, val] of Object.entries(state.boolFilters)) {
    if (val === 'yes') {
      conditions.push(`p.${col} = 1`);
    } else if (val === 'no') {
      conditions.push(`p.${col} = 0`);
    }
  }
  for (const [col, val] of Object.entries(state.textFilters)) {
    if (val) {
      conditions.push(`p.${col} = ?`);
      params.push(val);
    }
  }
  return [conditions, params];
}

/** Check if any filter is active. */
export function hasActiveFilters(state: FilterPanelState): boolean {
  return Object.values(state.boolFilters).some((v) => v !== 'any')
    || Object.values(state.textFilters).some((v) => !!v);
}

/** Clear all filters. */
export function clearFilters(state: FilterPanelState): void {
  state.boolFilters = {};
  state.textFilters = {};
}

/* ── Render helpers ── */

function nextBoolState(current: BoolFilterState): BoolFilterState {
  if (current === 'any') return 'yes';
  if (current === 'yes') return 'no';
  return 'any';
}

function boolStateLabel(state: BoolFilterState): string {
  if (state === 'yes') return t('filter.yes');
  if (state === 'no') return t('filter.no');
  return t('filter.any');
}

/**
 * Render the boolean filter panel HTML.
 * Returns the HTML string. Call attachFilterListeners() after inserting into DOM.
 */
export function renderBoolFilterPanel(
  filters: BoolFilterDef[],
  state: FilterPanelState,
  containerId: string,
): string {
  if (filters.length === 0) return '';

  // Group filters
  const groups = new Map<string, BoolFilterDef[]>();
  for (const f of filters) {
    if (!groups.has(f.group)) groups.set(f.group, []);
    groups.get(f.group)!.push(f);
  }

  let html = `<div class="bool-filter-panel" id="${containerId}">`;
  for (const [group, defs] of groups) {
    const groupLabel = t(`filter.group.${group}`);
    html += `<div class="bool-filter-group">`;
    html += `<span class="bool-filter-group-label">${groupLabel}</span>`;
    for (const def of defs) {
      const val = state.boolFilters[def.column] || 'any';
      const activeClass = val !== 'any' ? ` bool-filter-active bool-filter-${val}` : '';
      html += `<button class="bool-filter-btn${activeClass}" data-col="${def.column}" data-state="${val}" title="${t(def.labelKey)}: ${boolStateLabel(val)}">${t(def.labelKey)} <span class="bool-filter-state">${val !== 'any' ? boolStateLabel(val) : ''}</span></button>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

/**
 * Render text filter dropdowns.
 */
export async function renderTextFilterDropdowns(
  textFilters: TextFilterDef[],
  state: FilterPanelState,
  containerId: string,
): Promise<string> {
  if (textFilters.length === 0) return '';

  // Fetch distinct values for each text filter
  const options: Record<string, string[]> = {};
  for (const tf of textFilters) {
    const sql = `SELECT DISTINCT p.${tf.column} as val FROM web_product_core p WHERE p.${tf.column} IS NOT NULL AND p.${tf.column} != '' ORDER BY val`;
    const rows = await query<{ val: string }>(sql);
    options[tf.column] = rows.map((r) => r.val);
  }

  let html = `<div class="text-filter-panel" id="${containerId}">`;
  for (const tf of textFilters) {
    const vals = options[tf.column] || [];
    if (vals.length === 0) continue;
    const currentVal = state.textFilters[tf.column] || '';
    html += `<div class="control-group text-filter-group">`;
    html += `<label>${t(tf.labelKey)}</label>`;
    html += `<select class="text-filter-select" data-col="${tf.column}">`;
    html += `<option value="">${t('filter.text.all')}</option>`;
    for (const v of vals) {
      html += `<option value="${v}" ${v === currentVal ? 'selected' : ''}>${v}</option>`;
    }
    html += `</select></div>`;
  }
  html += `</div>`;
  return html;
}

/**
 * Attach event listeners to bool filter buttons.
 * onChange is called whenever any filter state changes.
 */
export function attachBoolFilterListeners(
  containerId: string,
  state: FilterPanelState,
  onChange: () => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll<HTMLButtonElement>('.bool-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.col!;
      const current = (state.boolFilters[col] || 'any') as BoolFilterState;
      const next = nextBoolState(current);
      if (next === 'any') {
        delete state.boolFilters[col];
      } else {
        state.boolFilters[col] = next;
      }
      // Update button appearance
      btn.dataset.state = next;
      btn.classList.toggle('bool-filter-active', next !== 'any');
      btn.classList.toggle('bool-filter-yes', next === 'yes');
      btn.classList.toggle('bool-filter-no', next === 'no');
      btn.querySelector('.bool-filter-state')!.textContent = next !== 'any' ? boolStateLabel(next) : '';
      btn.title = `${t(btn.dataset.col ? `filter.${btn.dataset.col}` : '')}: ${boolStateLabel(next)}`;
      onChange();
    });
  });
}

/**
 * Attach event listeners to text filter dropdowns.
 */
export function attachTextFilterListeners(
  containerId: string,
  state: FilterPanelState,
  onChange: () => void,
): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll<HTMLSelectElement>('.text-filter-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const col = sel.dataset.col!;
      if (sel.value) {
        state.textFilters[col] = sel.value;
      } else {
        delete state.textFilters[col];
      }
      onChange();
    });
  });
}
