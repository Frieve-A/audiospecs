import Plotly, { type Data, type Layout, type Config } from 'plotly.js-dist-min';
import { query } from '../db/database';
import { getCategoryLabel, getScaleForField, computeBarPercent } from '../presets';
import { t, getLocale, tAxis } from '../i18n';
import { showSourceMenu, dismissSourceMenu, setupSourceMenuDismiss, fetchAllSourceUrls } from '../sources';
import { setupColHelpTooltips } from '../components/col-help';

let cleanupDocListener: (() => void) | null = null;

const STORAGE_KEY = 'compare_ids';

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

function getCompareFields() {
  return [
    { key: 'category_primary', labelKey: 'compare.field.category', format: (v: unknown) => getCategoryLabel(v as string) },
    { key: 'price_anchor_usd', labelKey: 'compare.field.price', format: (v: unknown) => v != null ? '$' + Number(v).toLocaleString() : '—' },
    { key: 'release_year', labelKey: 'compare.field.year', format: (v: unknown) => v ?? '—' },
    { key: 'perf_sinad_db', labelKey: 'compare.field.sinad', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'perf_snr_db', labelKey: 'compare.field.snr', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'perf_thd_percent', labelKey: 'compare.field.thd', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'perf_dynamic_range_db', labelKey: 'compare.field.dynamic_range', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'perf_crosstalk_db', labelKey: 'compare.field.crosstalk', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'spec_impedance_ohm', labelKey: 'compare.field.impedance', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'sensitivity_proxy_db', labelKey: 'compare.field.sensitivity', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'driveability_index', labelKey: 'compare.field.driveability', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'spec_weight_g', labelKey: 'compare.field.weight', format: (v: unknown) => {
      if (v == null) return '—';
      const n = Number(v);
      if (n > 1000) return parseFloat((n / 1000).toPrecision(3)).toString() + ' kg';
      return n.toFixed(0) + ' g';
    } },
    { key: 'driver_total_count', labelKey: 'compare.field.driver_count', format: (v: unknown) => v != null ? String(Math.round(Number(v))) : '—' },
    { key: 'spec_freq_low_hz', labelKey: 'compare.field.freq_low', format: (v: unknown) => v != null ? formatHz(Number(v)) : '—' },
    { key: 'spec_freq_high_hz', labelKey: 'compare.field.freq_high', format: (v: unknown) => v != null ? formatHz(Number(v)) : '—' },
    { key: 'perf_fr_harman_std_db', labelKey: 'compare.field.fr_harman_std', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'perf_fr_harman_avg_db', labelKey: 'compare.field.fr_harman_avg', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_power_mw_32ohm', labelKey: 'compare.field.amp_power_mw_32ohm', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_power_w', labelKey: 'compare.field.amp_power_w', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_voltage_vrms', labelKey: 'compare.field.amp_voltage_vrms', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_voltage_vrms_balanced', labelKey: 'compare.field.amp_voltage_vrms_balanced', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'amp_output_impedance_ohm', labelKey: 'compare.field.amp_output_impedance_ohm', format: (v: unknown) => v != null ? sig3(Number(v)) : '—' },
    { key: 'crossover_freqs_hz_json', labelKey: 'compare.field.crossover', format: (v: unknown) => {
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

export async function renderCompare(
  container: HTMLElement,
  params: URLSearchParams,
): Promise<void> {
  // Merge URL params with stored IDs: URL params take priority if present
  const idsParam = params.get('ids') || '';
  const urlIds = idsParam.split(',').filter(Boolean);
  const storedIds = loadIds();

  // If URL has IDs, use those (and save them). Otherwise restore from storage.
  const ids = urlIds.length > 0 ? urlIds : storedIds;
  saveIds(ids);

  // Sync restored IDs to URL so the share button captures the full state
  if (ids.length > 0 && urlIds.length === 0) {
    history.replaceState(null, '', `#/compare?ids=${ids.join(',')}`);
  }

  container.innerHTML = `
    <div class="view-header">
      <h1>${t('compare.title')}</h1>
      <p>${t('compare.subtitle')}</p>
    </div>
    <div class="controls-bar">
      <div class="control-group product-search" style="flex:1;max-width:400px">
        <label>${t('compare.label.add')}</label>
        <input type="search" id="compare-search" placeholder="${t('compare.placeholder.search')}" style="width:100%"/>
        <div class="search-results" id="compare-results" style="display:none"></div>
      </div>
      <div class="control-group" style="display:flex;align-items:flex-end;margin-left:auto">
        <button id="compare-clear-all" class="danger">${t('common.clear_all')}</button>
      </div>
    </div>
    <div id="compare-content"></div>
  `;

  // Clear all button
  document.getElementById('compare-clear-all')!.addEventListener('click', () => {
    ids.length = 0;
    saveIds(ids);
    window.location.hash = '#/compare';
    loadCompare();
  });

  // Search
  const searchInput = document.getElementById('compare-search') as HTMLInputElement;
  const resultsEl = document.getElementById('compare-results')!;
  let searchTimeout: ReturnType<typeof setTimeout>;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) {
        resultsEl.style.display = 'none';
        return;
      }
      const like = `%${q}%`;
      const results = await query<{ product_id: string; brand_name_en: string; product_name: string; category_primary: string }>(
        `SELECT product_id, brand_name_en, product_name, category_primary
         FROM web_product_core
         WHERE product_name LIKE ? OR brand_name_en LIKE ?
         LIMIT 10`,
        [like, like],
      );
      if (!results.length) {
        resultsEl.innerHTML = `<div class="search-result-item" style="color:var(--text-tertiary)">${t('common.no_results')}</div>`;
      } else {
        resultsEl.innerHTML = results
          .map(
            (r) => `
          <div class="search-result-item" data-id="${r.product_id}">
            ${r.product_name}
            <div class="result-brand">${r.brand_name_en || t('common.unknown')} · ${getCategoryLabel(r.category_primary)}</div>
          </div>`,
          )
          .join('');
      }
      resultsEl.style.display = 'block';
      resultsEl.querySelectorAll('[data-id]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = (el as HTMLElement).dataset.id!;
          if (!ids.includes(id) && ids.length < 5) {
            ids.push(id);
            saveIds(ids);
            window.location.hash = `#/compare?ids=${ids.join(',')}`;
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
          <div class="card-body" style="text-align:center;padding:3rem;color:var(--text-tertiary)">
            ${t('compare.empty.line1')}
            <br/>${t('compare.empty.line2')}
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
    const compareFields = getCompareFields();

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
            <div id="compare-fr-plot" style="width:100%;height:400px"></div>
          </div>
        </div>
      `;
    }

    contentEl.innerHTML = frHtml + `
      <div class="card">
        <div class="card-body compare-scroll">
          <div class="compare-grid" style="grid-template-columns: 180px repeat(${ordered.length}, minmax(160px, 1fr))">
            <div class="compare-header compare-corner"></div>
            ${ordered.map((r) => `
              <div class="compare-header">
                ${r.brand_label} ${r.product_name}
                <br/><button class="remove-compare" data-id="${r.product_id}" style="font-size:0.7rem;margin-top:0.25rem">${t('common.remove')}</button>
              </div>
            `).join('')}
            ${compareFields.filter((f) => ordered.some((r) => r[f.key] != null)).map((f) => {
              const range = globalRange[f.key];
              const scale = getScaleForField(f.key);
              const descKey = `axisdesc.${f.key}`;
              const desc = t(descKey);
              const hasDesc = desc !== descKey;
              const helpIcon = hasDesc ? `<span class="col-help" data-tooltip="${escHtml(desc)}">?</span>` : '';
              return `
              <div class="compare-label">${formatUnitCasing(t(f.labelKey))}${helpIcon}</div>
              ${ordered.map((r) => {
                const v = r[f.key];
                const pid = r.product_id as string;
                if (typeof v === 'number' && range && range.min != null && range.max != null) {
                  const pct = computeBarPercent(v, range.min, range.max, scale);
                  return `<div class="compare-cell numeric bar-cell" data-product-id="${pid}" data-col="${f.key}" style="--bar-pct:${pct.toFixed(1)}">${f.format(v)}</div>`;
                }
                if (typeof v === 'number') {
                  return `<div class="compare-cell numeric" data-product-id="${pid}" data-col="${f.key}">${f.format(v)}</div>`;
                }
                return `<div class="compare-cell">${f.format(v)}</div>`;
              }).join('')}`;
            }).join('')}
            <div class="compare-label">${t('compare.field.search')}</div>
            ${ordered.map((r) => `<div class="compare-cell" style="display:flex;justify-content:center"><div class="search-icons">
              <button class="search-google" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Google">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              </button>
              <button class="search-amazon" data-brand="${escHtml(String(r.brand_label || ''))}" data-name="${escHtml(String(r.product_name || ''))}" title="Amazon [PR]">
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#232F3E" d="M6.61 11.802c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02z"/><path fill="#FF9900" d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13z"/><path fill="#FF9900" d="M19.525 18.448c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z"/></svg>
              </button>
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
      const traces: Data[] = [];

      for (let i = 0; i < ordered.length; i++) {
        const pid = ordered[i].product_id as string;
        const fr = frRows.find((r) => r.product_id === pid && r.series_type === 'raw')
          ?? frRows.find((r) => r.product_id === pid);
        if (!fr) continue;
        const points: [number, number][] = JSON.parse(fr.points_json);
        traces.push({
          x: points.map((p) => p[0]),
          y: points.map((p) => p[1]),
          type: 'scatter',
          mode: 'lines',
          name: `${ordered[i].brand_label} ${ordered[i].product_name}`,
          line: { color: TRACE_COLORS[i % TRACE_COLORS.length], width: 1.5 },
          hovertemplate: '%{x:.0f} Hz: %{y:.1f} dB<extra></extra>',
        });
      }

      if (traces.length > 0) {
        const baseFontPx = 16;
        const currentFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize || `${baseFontPx}`);
        const fontScale = Number.isFinite(currentFontPx) ? currentFontPx / baseFontPx : 1.25;

        const layout: Partial<Layout> = {
          xaxis: {
            title: { text: t('compare.fr.xaxis'), font: { family: 'Inter, sans-serif', size: 13 * fontScale, color: '#374151' }, standoff: 10 * fontScale },
            type: 'log',
            gridcolor: '#eee',
            zerolinecolor: '#ddd',
          },
          yaxis: {
            title: { text: t('compare.fr.yaxis'), font: { family: 'Inter, sans-serif', size: 13 * fontScale, color: '#374151' }, standoff: 10 * fontScale },
            gridcolor: '#eee',
            zerolinecolor: '#ddd',
          },
          paper_bgcolor: '#fff',
          plot_bgcolor: '#fff',
          font: { family: 'Inter, sans-serif', size: 12 * fontScale },
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

        await Plotly.react('compare-fr-plot', traces, layout, plotConfig);
      }
    }

    // Column help tooltips on compare labels
    const compareScroll = contentEl.querySelector<HTMLElement>('.compare-scroll');
    setupColHelpTooltips(contentEl, compareScroll);

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

    contentEl.querySelectorAll('.remove-compare').forEach((btn) => {
      btn.addEventListener('click', () => {
        const removeId = (btn as HTMLElement).dataset.id!;
        const idx = ids.indexOf(removeId);
        if (idx >= 0) ids.splice(idx, 1);
        saveIds(ids);
        window.location.hash = `#/compare?ids=${ids.join(',')}`;
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

function formatUnitCasing(s: string): string {
  // CSS for compare labels uses `text-transform: uppercase`, so we explicitly protect unit strings.
  return s
    .replace(/\(Hz\)/g, '(<span class="unit-case">Hz</span>)')
    .replace(/\(dB\)/g, '(<span class="unit-case">dB</span>)');
}
