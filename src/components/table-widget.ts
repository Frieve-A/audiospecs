import { query } from '../db/database';
import { getScaleForField, computeBarPercent, getCategoryLabel } from '../presets';
import { navigate } from '../router';
import { t, tAxis, getLocale } from '../i18n';
import { showSourceMenu, setupSourceMenuDismiss } from '../sources';

export interface TableWidgetConfig {
  id: string;
  categories: string[];
  sort: string;
  sortDir: 'asc' | 'desc';
  limit?: number;
  columns: string[];
}

// SVG icons shared with explore view
const GOOGLE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>';
const AMAZON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#232F3E" d="M6.61 11.802c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02z"/><path fill="#FF9900" d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13z"/><path fill="#FF9900" d="M19.525 18.448c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z"/></svg>';

let sourceMenuSetup = false;

function colSqlExpr(key: string): string {
  if (key === 'price_anchor_usd') return 'coalesce(p.street_price_usd, p.msrp_usd)';
  if (key === 'msrp_usd') return 'p.msrp_usd';
  return `p.${key}`;
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
  if (/^freq_(low|high)_hz(_measured|_spec)?$/.test(key)) {
    if (v >= 1000) return parseFloat((v / 1000).toPrecision(3)).toString() + 'k';
    return sig3(v);
  }
  if (key === 'release_year') return String(v);
  if (key === 'weight_g') return v.toLocaleString(undefined, { maximumFractionDigits: 0 }) + 'g';
  if (key === 'driver_total_count') return String(Math.round(v));
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

export async function renderTableWidget(
  container: HTMLElement,
  config: TableWidgetConfig,
): Promise<void> {
  const tableId = `table-widget-${config.id}`;
  const limit = config.limit ?? 10;
  const numericKeys = config.columns.filter((k) => k !== 'category_primary');
  const showCategory = config.columns.includes('category_primary');
  const catPlaceholders = config.categories.map(() => '?').join(',');

  // Global min/max for bar normalization (within the category)
  const minMaxExprs = numericKeys.map((k) => {
    const expr = colSqlExpr(k);
    return `MIN(${expr}) as "min_${k}", MAX(${expr}) as "max_${k}"`;
  }).join(', ');

  const [globalStats] = await query<Record<string, number>>(
    `SELECT ${minMaxExprs} FROM web_product_core p WHERE p.category_primary IN (${catPlaceholders})`,
    config.categories,
  );

  const colRange: Record<string, { min: number; max: number; scale: 'log' | 'linear' | 'year' }> = {};
  for (const k of numericKeys) {
    colRange[k] = {
      min: globalStats[`min_${k}`],
      max: globalStats[`max_${k}`],
      scale: getScaleForField(k),
    };
  }

  // Build data query
  const numericSelectParts = numericKeys.map((k) => {
    const expr = colSqlExpr(k);
    return expr === `p.${k}` ? `p.${k}` : `${expr} as ${k}`;
  });

  const sortExpr = colSqlExpr(config.sort);
  const dataSql = `
    SELECT
      p.product_id,
      CASE WHEN p.brand_name_en = '' THEN 'unknown' ELSE p.brand_name_en END as brand_label,
      p.product_name,
      p.category_primary,
      ${numericSelectParts.join(', ')}
    FROM web_product_core p
    WHERE p.category_primary IN (${catPlaceholders})
      AND ${sortExpr} IS NOT NULL
    ORDER BY ${sortExpr} ${config.sortDir}
    LIMIT ?
  `;

  const rows = await query<Record<string, unknown>>(dataSql, [...config.categories, limit]);

  // Columns: brand, product, optional category, then numeric columns
  const allCols = [
    { key: 'brand_label', label: t('explore.col.brand'), numeric: false },
    { key: 'product_name', label: t('explore.col.product'), numeric: false },
    ...(showCategory ? [{ key: 'category_primary', label: t('explore.col.category'), numeric: false }] : []),
    ...numericKeys.map((k) => ({ key: k, label: tAxis(k), numeric: true })),
  ];

  const sortArrow = config.sortDir === 'asc' ? '↑' : '↓';

  const theadHtml = allCols.map((col) => {
    const isSort = col.key === config.sort;
    return `<th>${formatUnitCasing(escHtml(col.label))}${isSort ? ` <span class="sort-arrow active">${sortArrow}</span>` : ''}</th>`;
  }).join('') + `<th>${t('explore.col.compare')}</th><th>${t('explore.col.search')}</th>`;

  const tbodyHtml = rows.map((r) => `
    <tr>
      ${allCols.map((col) => {
        const v = r[col.key];
        if (col.numeric) {
          if (v != null) {
            const range = colRange[col.key];
            const pct = (range && range.min != null && range.max != null)
              ? computeBarPercent(v as number, range.min, range.max, range.scale)
              : 0;
            return `<td class="numeric bar-cell" data-product-id="${r.product_id}" data-col="${col.key}" style="--bar-pct:${pct.toFixed(1)}">${formatNum(v as number, col.key)}</td>`;
          }
          return '<td class="numeric">\u2014</td>';
        }
        if (col.key === 'category_primary') {
          return `<td><span class="chip cat-${v}">${getCategoryLabel(v as string)}</span></td>`;
        }
        return `<td>${v ?? '\u2014'}</td>`;
      }).join('')}
      <td><button class="compare-add" data-id="${r.product_id}" title="${t('explore.add_to_compare')}">+</button></td>
      <td class="search-icons">
        <button class="search-google" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Google">${GOOGLE_SVG}</button>
        <button class="search-amazon" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Amazon [PR]">${AMAZON_SVG}</button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-body widget-table-wrap">
        <table class="data-table" id="${tableId}">
          <thead><tr>${theadHtml}</tr></thead>
          <tbody>${tbodyHtml}</tbody>
        </table>
      </div>
    </div>
  `;

  const tableEl = document.getElementById(tableId)!;

  // Compare buttons
  tableEl.querySelectorAll<HTMLElement>('.compare-add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!;
      let ids: string[] = [];
      try { ids = JSON.parse(sessionStorage.getItem('compare_ids') || '[]'); } catch { /* empty */ }
      if (!ids.includes(id) && ids.length < 5) {
        ids.push(id);
        sessionStorage.setItem('compare_ids', JSON.stringify(ids));
        navigate('compare', { ids: ids.join(',') });
      }
    });
  });

  // Search buttons
  tableEl.querySelectorAll<HTMLElement>('.search-google').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = `${btn.dataset.brand} ${btn.dataset.name}`.trim();
      window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank');
    });
  });
  tableEl.querySelectorAll<HTMLElement>('.search-amazon').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = `${btn.dataset.brand} ${btn.dataset.name}`.trim();
      const url = getLocale() === 'ja'
        ? `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}&tag=frieve02-22`
        : `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=frieve-20`;
      window.open(url, '_blank');
    });
  });

  // Source context menu on spec cells
  tableEl.querySelectorAll<HTMLElement>('td[data-product-id][data-col]').forEach((td) => {
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

  if (!sourceMenuSetup) {
    sourceMenuSetup = true;
    setupSourceMenuDismiss();
  }
}
