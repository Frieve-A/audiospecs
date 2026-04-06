import { query } from '../db/database';
import { AXES, CATEGORY_KEYS, getCategoryLabel, getScaleForField, computeBarPercent } from '../presets';
import { navigate } from '../router';
import { t, tAxis, getLocale } from '../i18n';
import { showSourceMenu, dismissSourceMenu, setupSourceMenuDismiss } from '../sources';
import { setupColHelpTooltips } from '../components/col-help';

interface ExploreState {
  search: string;
  category: string;
  sort: string;
  sortDir: 'asc' | 'desc';
  page: number;
  columns: string[];
}

const PAGE_SIZE = 50;
const DEFAULT_SORT = 'price_anchor_usd';

/** Fixed (non-numeric) columns always shown */
const FIXED_COLUMNS = [
  { key: 'brand_label', labelKey: 'explore.col.brand', numeric: false },
  { key: 'product_name', labelKey: 'explore.col.product', numeric: false },
  { key: 'category_primary', labelKey: 'explore.col.category', numeric: false },
];

// Only brand and product columns are fixed (category scrolls with the table).
const FIXED_COLUMN_KEYS = new Set(['brand_label', 'product_name']);

/** All selectable numeric columns — derived from AXES */
const ALL_NUMERIC_COLUMNS = AXES.map((a) => ({
  key: a.id,
  labelKey: `explore.col.${a.id}`,
  numeric: true,
  source: a.source,
}));

/** Default numeric column keys (matches original display) */
const DEFAULT_NUMERIC_KEYS = [
  'price_anchor_usd', 'release_year', 'perf_sinad_db', 'perf_snr_db',
  'spec_freq_low_hz', 'spec_freq_high_hz',
];

/** Build active COLUMN_KEYS from selected numeric keys */
function buildColumnKeys(numericKeys: string[]) {
  const numSet = new Set(numericKeys);
  const numCols = ALL_NUMERIC_COLUMNS.filter((c) => numSet.has(c.key));
  return [...FIXED_COLUMNS, ...numCols];
}

const EXPLORE_STORAGE_KEY = 'explore_state';

function loadExploreState(): Partial<ExploreState> {
  try {
    const raw = sessionStorage.getItem(EXPLORE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Validate columns array
    if (parsed.columns && !Array.isArray(parsed.columns)) delete parsed.columns;
    return parsed;
  } catch {
    return {};
  }
}

function saveExploreState(state: ExploreState): void {
  sessionStorage.setItem(EXPLORE_STORAGE_KEY, JSON.stringify(state));
}

export async function renderExplore(
  container: HTMLElement,
  params: URLSearchParams,
): Promise<void> {
  // Merge: URL params > sessionStorage > defaults
  const stored = loadExploreState();
  const hasUrlParams = params.toString().length > 0;

  // Parse columns from URL or session
  const allNumericIds = new Set(ALL_NUMERIC_COLUMNS.map((c) => c.key));
  function parseColumns(raw: string | null | undefined): string[] | null {
    if (!raw) return null;
    const keys = raw.split(',').filter((k) => allNumericIds.has(k));
    return keys.length > 0 ? keys : null;
  }

  const urlCols = parseColumns(params.get('cols'));
  const storedCols = stored.columns && stored.columns.length > 0
    ? stored.columns.filter((k) => allNumericIds.has(k))
    : null;

  const initialColumns = urlCols
    || (!hasUrlParams && storedCols ? storedCols : null)
    || DEFAULT_NUMERIC_KEYS;

  const state: ExploreState = {
    search: params.get('q') || (!hasUrlParams ? stored.search || '' : ''),
    category: params.get('cat') || (!hasUrlParams ? stored.category || '' : ''),
    sort: buildColumnKeys(initialColumns).some((c) => c.key === params.get('sort')?.split(':')[0])
      ? params.get('sort')!.split(':')[0]
      : (!hasUrlParams && stored.sort ? stored.sort : DEFAULT_SORT),
    sortDir: params.get('sort')?.split(':')[1] === 'asc' ? 'asc'
      : params.get('sort')?.split(':')[1] === 'desc' ? 'desc'
      : (!hasUrlParams && stored.sortDir ? stored.sortDir : 'desc'),
    page: Number(params.get('page')) || (!hasUrlParams && stored.page ? stored.page : 0),
    columns: initialColumns,
  };

  const colSelectionSet = new Set(state.columns);

  container.innerHTML = `
    <div class="view-header">
      <h1>${t('explore.title')}</h1>
      <p>${t('explore.subtitle')}</p>
    </div>
    <div class="controls-bar">
      <div class="control-group">
        <label>${t('explore.label.search')}</label>
        <input type="search" id="explore-search" placeholder="${t('explore.placeholder.search')}" value="${escHtml(state.search)}" style="min-width:200px"/>
      </div>
      <div class="control-group">
        <label>${t('explore.label.category')}</label>
        <select id="explore-cat">
          <option value="">${t('common.all')}</option>
          ${CATEGORY_KEYS.map((c) => `<option value="${c}" ${state.category === c ? 'selected' : ''}>${getCategoryLabel(c)}</option>`).join('')}
        </select>
      </div>
      <div class="control-group" style="display:flex;align-items:flex-end;margin-left:auto">
        <button id="explore-reset" class="danger">${t('common.reset')}</button>
      </div>
    </div>
    <div class="column-selector" id="explore-col-selector">
      <button class="column-selector-toggle" id="explore-col-toggle">
        ${t('explore.label.columns')} <span class="column-selector-arrow">▸</span>
      </button>
      <div class="column-selector-panel" id="explore-col-panel" hidden>
        <div class="column-selector-list">
          ${ALL_NUMERIC_COLUMNS.map((col) => `
            <label class="column-selector-item">
              <input type="checkbox" value="${col.key}" ${colSelectionSet.has(col.key) ? 'checked' : ''} />
              ${tAxis(col.key)}
            </label>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <div id="explore-table-wrap" class="card-body data-table-wrap fixed-table-wrap">
        <table class="data-table" id="explore-table">
          <thead><tr id="explore-thead"></tr></thead>
          <tbody id="explore-tbody"></tbody>
        </table>
      </div>
      <div class="pagination" id="explore-pagination"></div>
    </div>
  `;

  const theadEl = document.getElementById('explore-thead')!;
  const tbodyEl = document.getElementById('explore-tbody')!;
  const pagEl = document.getElementById('explore-pagination')!;

  /** Check if current columns match the default set */
  function isDefaultColumns(): boolean {
    if (state.columns.length !== DEFAULT_NUMERIC_KEYS.length) return false;
    return state.columns.every((k, i) => k === DEFAULT_NUMERIC_KEYS[i]);
  }

  function syncUrl(): void {
    const p: Record<string, string> = {};
    if (state.search) p.q = state.search;
    if (state.category) p.cat = state.category;
    p.sort = `${state.sort}:${state.sortDir}`;
    if (state.page > 0) p.page = String(state.page);
    if (!isDefaultColumns()) p.cols = state.columns.join(',');
    const qs = '?' + new URLSearchParams(p).toString();
    history.replaceState(null, '', `#/explore${qs}`);
    saveExploreState(state);
  }

  function getActiveColumns() {
    return buildColumnKeys(state.columns);
  }

  function renderThead(): void {
    const cols = getActiveColumns();
    theadEl.innerHTML = cols.map((col) => {
      const active = state.sort === col.key;
      const arrow = active ? (state.sortDir === 'asc' ? '↑' : '↓') : '↕';
      const label = formatUnitCasing(t(col.labelKey)).replace(/\n/g, '<br>');
      const fixedClass = FIXED_COLUMN_KEYS.has(col.key) ? 'fixed-col' : '';
      const descKey = `axisdesc.${col.key}`;
      const desc = col.numeric ? t(descKey) : '';
      const helpIcon = desc ? `<span class="col-help" data-tooltip="${escHtml(desc)}">?</span>` : '';
      return `<th data-col="${col.key}" class="${fixedClass}">${label}${helpIcon} <span class="sort-arrow ${active ? 'active' : ''}">${arrow}</span></th>`;
    }).join('') + `<th class="col-action">${t('explore.col.compare')}</th><th class="col-action">${t('explore.col.search')}</th>`;

    theadEl.querySelectorAll('th[data-col]').forEach((th) => {
      th.addEventListener('click', () => {
        const col = (th as HTMLElement).dataset.col!;
        if (state.sort === col) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort = col;
          state.sortDir = 'desc';
        }
        state.page = 0;
        syncUrl();
        loadData();
      });
    });

    // Column help tooltips
    setupColHelpTooltips(theadEl, document.getElementById('explore-table-wrap'));
  }

  // Pre-compute global min/max (unfiltered) for bar normalization — runs once for ALL numeric columns
  const allNumericKeys = ALL_NUMERIC_COLUMNS.map((c) => c.key);

  /** Get SQL expression for a numeric column, prefixed with table alias p. */
  function colSqlExpr(col: typeof ALL_NUMERIC_COLUMNS[number]): string {
    if (col.key === 'price_anchor_usd') return 'coalesce(p.street_price_usd, p.msrp_usd)';
    if (col.key === 'msrp_usd') return 'p.msrp_usd';
    return `p.${col.key}`;
  }

  const minMaxExprs = allNumericKeys.map((k) => {
    const col = ALL_NUMERIC_COLUMNS.find((c) => c.key === k)!;
    const sqlSrc = colSqlExpr(col);
    return `MIN(${sqlSrc}) as "min_${k}", MAX(${sqlSrc}) as "max_${k}"`;
  }).join(', ');

  const globalSql = `SELECT ${minMaxExprs} FROM web_product_core p`;
  const [globalStats] = await query<Record<string, number>>(globalSql);

  const colRange: Record<string, { min: number; max: number; scale: 'log' | 'linear' | 'year' }> = {};
  for (const k of allNumericKeys) {
    colRange[k] = {
      min: globalStats[`min_${k}`],
      max: globalStats[`max_${k}`],
      scale: getScaleForField(k),
    };
  }

  async function loadData(): Promise<void> {
    renderThead();

    const conditions: string[] = [];
    const sqlParams: unknown[] = [];

    if (state.category) {
      conditions.push('p.category_primary = ?');
      sqlParams.push(state.category);
    }
    if (state.search) {
      conditions.push("(p.product_name LIKE ? OR p.brand_name_en LIKE ? OR p.manufacturer_name_en LIKE ?)");
      const like = `%${state.search}%`;
      sqlParams.push(like, like, like);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // Determine sort column
    let sortCol = state.sort;
    if (sortCol === 'brand_label') sortCol = 'brand_label';
    else if (sortCol === 'price_anchor_usd') sortCol = 'price_anchor_usd';

    const countSql = `SELECT COUNT(*) as cnt FROM web_product_core p ${where}`;
    const [{ cnt }] = await query<{ cnt: number }>(countSql, sqlParams);

    // Build SELECT columns dynamically from active numeric columns
    const activeCols = getActiveColumns();
    const numericSelectParts = activeCols
      .filter((c) => c.numeric)
      .map((c) => {
        const nc = ALL_NUMERIC_COLUMNS.find((n) => n.key === c.key)!;
        const expr = colSqlExpr(nc);
        return expr === `p.${c.key}` ? `p.${c.key}` : `${expr} as ${c.key}`;
      });

    const dataSql = `
      SELECT
        p.product_id,
        CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END as brand_label,
        p.product_name,
        p.category_primary,
        ${numericSelectParts.join(',\n        ')}
      FROM web_product_core p
      ${where}
      ORDER BY ${sortCol} IS NULL, ${sortCol} ${state.sortDir}
      LIMIT ? OFFSET ?
    `;

    const rows = await query<Record<string, unknown>>(dataSql, [
      ...sqlParams,
      PAGE_SIZE,
      state.page * PAGE_SIZE,
    ]);

    const totalColSpan = activeCols.length + 2;
    tbodyEl.innerHTML = rows.length
      ? rows
          .map(
            (r) => `
          <tr>
            ${activeCols.map((col) => {
              const v = r[col.key];
              const fixedClass = FIXED_COLUMN_KEYS.has(col.key) ? 'fixed-col' : '';
              if (col.key === 'category_primary') {
                return `<td class="${fixedClass}" data-col="${col.key}"><span class="chip cat-${v}">${getCategoryLabel(v as string)}</span></td>`;
              }
              if (col.numeric) {
                if (v != null) {
                  const range = colRange[col.key];
                  const pct = (range && range.min != null && range.max != null)
                    ? computeBarPercent(v as number, range.min, range.max, range.scale)
                    : 0;
                  return `<td class="numeric bar-cell" data-product-id="${r.product_id}" data-col="${col.key}" style="--bar-pct:${pct.toFixed(1)}">${formatNum(v as number, col.key)}</td>`;
                }
                return `<td class="numeric">—</td>`;
              }
              return `<td class="${fixedClass}" data-col="${col.key}">${v ?? '—'}</td>`;
            }).join('')}
            <td class="col-action"><button class="compare-add" data-id="${r.product_id}" title="${t('explore.add_to_compare')}">+</button></td>
            <td class="col-action search-icons">
              <button class="search-google" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Google">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              </button>
              <button class="search-amazon" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Amazon [PR]">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#232F3E" d="M6.61 11.802c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02z"/><path fill="#FF9900" d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13z"/><path fill="#FF9900" d="M19.525 18.448c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z"/></svg>
              </button>
            </td>
          </tr>`,
          )
          .join('')
      : `<tr><td colspan="${totalColSpan}" style="text-align:center;padding:2rem;color:var(--text-tertiary)">${t('explore.no_products')}</td></tr>`;

    // Set left offsets for fixed columns based on actual rendered widths.
    const tableEl = document.getElementById('explore-table')!;
    const fixedKeysInOrder = FIXED_COLUMNS.map((c) => c.key).filter((key) => FIXED_COLUMN_KEYS.has(key));
    requestAnimationFrame(() => {
      let leftPx = 0;
      fixedKeysInOrder.forEach((key, idx) => {
        const th = tableEl.querySelector<HTMLTableCellElement>(`thead th.fixed-col[data-col="${key}"]`);
        if (!th) return;
        const width = th.getBoundingClientRect().width;
        th.style.left = `${leftPx}px`;
        th.style.zIndex = String(10 + idx);

        tableEl.querySelectorAll<HTMLTableCellElement>(`tbody td.fixed-col[data-col="${key}"]`).forEach((td) => {
          td.style.left = `${leftPx}px`;
          td.style.zIndex = String(7 + idx);
        });

        leftPx += width;
      });
    });

    // Compare buttons
    tbodyEl.querySelectorAll('.compare-add').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        let ids: string[] = [];
        try {
          const raw = sessionStorage.getItem('compare_ids');
          ids = raw ? JSON.parse(raw) : [];
        } catch { /* empty */ }
        if (!ids.includes(id) && ids.length < 5) {
          ids.push(id);
          sessionStorage.setItem('compare_ids', JSON.stringify(ids));
          navigate('compare', { ids: ids.join(',') });
        }
      });
    });

    // Search buttons
    tbodyEl.querySelectorAll('.search-google').forEach((btn) => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        const q = `${el.dataset.brand} ${el.dataset.name}`.trim();
        window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
      });
    });
    tbodyEl.querySelectorAll('.search-amazon').forEach((btn) => {
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
    tbodyEl.querySelectorAll<HTMLElement>('td[data-product-id][data-col]').forEach((td) => {
      td.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSourceMenu(e.clientX, e.clientY, td.dataset.productId!, [td.dataset.col!]);
      });
      let longTapTimer: ReturnType<typeof setTimeout> | null = null;
      td.addEventListener('touchstart', (ev) => {
        longTapTimer = setTimeout(() => {
          ev.preventDefault();
          const touch = ev.changedTouches[0] || ev.touches[0];
          showSourceMenu(touch.clientX, touch.clientY, td.dataset.productId!, [td.dataset.col!]);
        }, 500);
      }, { passive: false });
      td.addEventListener('touchend', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
      td.addEventListener('touchmove', () => { if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; } });
    });

    const totalPages = Math.ceil(cnt / PAGE_SIZE);
    const start = state.page * PAGE_SIZE + 1;
    const end = Math.min((state.page + 1) * PAGE_SIZE, cnt);
    pagEl.innerHTML = `
      <span>${t('explore.showing', { start, end, total: cnt })}</span>
      <div class="page-buttons">
        <button ${state.page === 0 ? 'disabled' : ''} id="prev-page">${t('explore.prev')}</button>
        <button ${state.page >= totalPages - 1 ? 'disabled' : ''} id="next-page">${t('explore.next')}</button>
      </div>
    `;
    document.getElementById('prev-page')?.addEventListener('click', () => {
      state.page--;
      syncUrl();
      loadData();
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
      state.page++;
      syncUrl();
      loadData();
    });
  }

  // Event listeners
  let searchTimeout: ReturnType<typeof setTimeout>;
  document.getElementById('explore-search')!.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = (e.target as HTMLInputElement).value;
      state.page = 0;
      syncUrl();
      loadData();
    }, 300);
  });
  document.getElementById('explore-cat')!.addEventListener('change', (e) => {
    state.category = (e.target as HTMLSelectElement).value;
    state.page = 0;
    syncUrl();
    loadData();
  });

  // Column selector toggle
  const colToggleBtn = document.getElementById('explore-col-toggle')!;
  const colPanel = document.getElementById('explore-col-panel')!;
  colToggleBtn.addEventListener('click', () => {
    const open = !colPanel.hidden;
    colPanel.hidden = !colPanel.hidden;
    colToggleBtn.querySelector('.column-selector-arrow')!.textContent = open ? '▸' : '▾';
  });

  // Column selector checkboxes
  colPanel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = Array.from(colPanel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
        .map((el) => el.value);
      // Preserve order from ALL_NUMERIC_COLUMNS
      state.columns = ALL_NUMERIC_COLUMNS.map((c) => c.key).filter((k) => checked.includes(k));
      // If sort column was removed, reset to default
      const activeCols = getActiveColumns();
      if (!activeCols.some((c) => c.key === state.sort)) {
        state.sort = DEFAULT_SORT;
        state.sortDir = 'desc';
      }
      state.page = 0;
      syncUrl();
      loadData();
    });
  });

  // Reset button — restore defaults and clear sessionStorage
  document.getElementById('explore-reset')!.addEventListener('click', () => {
    sessionStorage.removeItem(EXPLORE_STORAGE_KEY);
    state.search = '';
    state.category = '';
    state.sort = DEFAULT_SORT;
    state.sortDir = 'desc';
    state.page = 0;
    state.columns = [...DEFAULT_NUMERIC_KEYS];
    // Update UI inputs
    (document.getElementById('explore-search') as HTMLInputElement).value = '';
    (document.getElementById('explore-cat') as HTMLSelectElement).value = '';
    // Update column checkboxes
    const defaultSet = new Set(DEFAULT_NUMERIC_KEYS);
    colPanel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
      cb.checked = defaultSet.has(cb.value);
    });
    syncUrl();
    loadData();
  });

  setupSourceMenuDismiss();
  syncUrl();
  renderThead();
  await loadData();
}

function sig3(v: number): string {
  const n = parseFloat(v.toPrecision(3));
  if (n !== 0 && Math.abs(n) < 0.001) {
    const digits = -Math.floor(Math.log10(Math.abs(n))) + 2;
    return n.toFixed(digits).replace(/\.?0+$/, '');
  }
  return n.toString();
}

function formatNum(v: number, key: string): string {
  if (key === 'price_anchor_usd' || key === 'msrp_usd')
    return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (key === 'spec_freq_low_hz' || key === 'spec_freq_high_hz')
    return formatHz(v);
  if (key === 'release_year') return String(v);
  if (key === 'spec_weight_g') return v.toLocaleString(undefined, { maximumFractionDigits: 0 }) + 'g';
  if (key === 'driver_total_count') return String(Math.round(v));
  return sig3(v);
}

function formatHz(v: number): string {
  if (v >= 1000) return parseFloat((v / 1000).toPrecision(3)).toString() + 'k';
  return sig3(v);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function formatUnitCasing(s: string): string {
  // CSS for table headers uses `text-transform: uppercase`, so we explicitly protect unit strings.
  return s
    .replace(/\(Hz\)/g, '(<span class="unit-case">Hz</span>)')
    .replace(/\(dB\)/g, '(<span class="unit-case">dB</span>)');
}

