import { query } from '../db/database';
import { getCategoryLabel } from '../presets';
import { navigate } from '../router';
import { t } from '../i18n';

// Columns that count as "performance data" for coverage reporting.
// The DB's `has_perf_data` flag is unreliable — it is 0 for entire categories
// that clearly have performance values (e.g. every sub_woofer/accessory, and
// all but one mic), so coverage is derived from the actual performance columns
// instead. This set is the multi-source performance group defined in
// dev/web_public_db_mapping.md (electronics 性能 + transducer 仕様 + amp 出力)
// plus the derived sensitivity_proxy_db.
const PERF_COLUMNS = [
  'sinad_db',
  'snr_db',
  'thd_percent',
  'dynamic_range_db',
  'crosstalk_db',
  'impedance_ohm',
  'sensitivity_db_per_mw',
  'sensitivity_db_per_v',
  'sensitivity_proxy_db',
  'freq_low_hz',
  'freq_high_hz',
  'amp_power_mw_32ohm',
  'amp_power_w',
  'amp_voltage_vrms',
  'amp_voltage_vrms_balanced',
  'amp_output_impedance_ohm',
  'line_output_impedance_ohm',
];
// SQL predicate: true when a row has at least one performance metric.
const HAS_PERF_SQL = `(${PERF_COLUMNS.map((c) => `${c} IS NOT NULL`).join(' OR ')})`;

export async function renderAbout(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="view-header">
      <h1>${t('about.title')}</h1>
      <p>${t('about.subtitle')}</p>
    </div>
    <div id="about-content">
      <div class="loading-overlay"><div class="loading-spinner"></div><div class="loading-text">${t('about.loading')}</div></div>
    </div>
  `;

  const contentEl = document.getElementById('about-content')!;

  // Manifest
  const manifest = await query<{ key: string; value: string }>(
    'SELECT key, value FROM web_manifest',
  );
  const manifestMap = Object.fromEntries(manifest.map((r) => [r.key, r.value]));

  // Category coverage
  const catCoverage = await query<{
    category_primary: string;
    total: number;
    has_price: number;
    has_perf: number;
  }>(`
    SELECT
      p.category_primary,
      COUNT(*) as total,
      SUM(CASE WHEN coalesce(p.street_price_usd, p.msrp_usd) IS NOT NULL THEN 1 ELSE 0 END) as has_price,
      SUM(CASE WHEN ${HAS_PERF_SQL} THEN 1 ELSE 0 END) as has_perf
    FROM web_product_core p
    GROUP BY p.category_primary
    ORDER BY total DESC
  `);

  // Summary stats from web_product_core
  const totalProducts = await query<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM web_product_core",
  );
  const withPrice = await query<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM web_product_core WHERE coalesce(street_price_usd, msrp_usd) IS NOT NULL",
  );
  const withPerf = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM web_product_core WHERE ${HAS_PERF_SQL}`,
  );
  const brandCount = await query<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM web_brand_summary',
  );

  contentEl.innerHTML = `
    <div class="about-page">

      <section class="about-section">
        <h2>${t('about.section.what')}</h2>
        <p>${t('about.section.what.body')}</p>
      </section>

      <section class="about-section">
        <h2>${t('about.section.data')}</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${totalProducts[0]?.cnt || 0}</div>
            <div class="stat-label">${t('about.stat.products')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${brandCount[0]?.cnt ?? 0}</div>
            <div class="stat-label">${t('about.stat.brands')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${withPrice[0]?.cnt || 0}</div>
            <div class="stat-label">${t('about.stat.with_price')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${withPerf[0]?.cnt || 0}</div>
            <div class="stat-label">${t('about.stat.with_perf')}</div>
          </div>
        </div>

        <h3>${t('about.card.coverage')}</h3>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t('about.col.category')}</th>
                <th>${t('about.col.total')}</th>
                <th>${t('about.col.with_price')}</th>
                <th>${t('about.col.with_perf')}</th>
                <th>${t('about.col.price_pct')}</th>
                <th>${t('about.col.perf_pct')}</th>
              </tr>
            </thead>
            <tbody>
              ${catCoverage.map((c) => `
                <tr class="clickable-row" data-category="${c.category_primary}">
                  <td><span class="chip cat-${c.category_primary}">${getCategoryLabel(c.category_primary)}</span></td>
                  <td class="numeric">${c.total}</td>
                  <td class="numeric">${c.has_price}</td>
                  <td class="numeric">${c.has_perf}</td>
                  <td class="numeric">${(c.has_price / c.total * 100).toFixed(0)}%</td>
                  <td class="numeric">${(c.has_perf / c.total * 100).toFixed(0)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="about-section">
        <h2>${t('about.section.who')}</h2>
        <ul class="about-list">
          <li>${t('about.who.buyers')}</li>
          <li>${t('about.who.enthusiasts')}</li>
          <li>${t('about.who.data')}</li>
        </ul>
      </section>

      <section class="about-section">
        <h2>${t('about.section.features')}</h2>
        <h3>${t('about.feature.scatter.title')}</h3>
        <p>${t('about.feature.scatter.body')}</p>
        <h3>${t('about.feature.explore.title')}</h3>
        <p>${t('about.feature.explore.body')}</p>
        <h3>${t('about.feature.compare.title')}</h3>
        <p>${t('about.feature.compare.body')}</p>
      </section>

      <section class="about-section">
        <h2>${t('about.section.highlights')}</h2>
        <ul class="about-list">
          <li>${t('about.highlight.objective')}</li>
          <li>${t('about.highlight.unified')}</li>
          <li>${t('about.highlight.share')}</li>
        </ul>
      </section>

      <section class="about-section">
        <h2>${t('about.section.other')}</h2>
        <p>${t('about.other.pricing')}</p>
      </section>

      <section class="about-section">
        <h2>${t('about.section.notes')}</h2>
        <ul class="about-list">
          <li>${t('about.note.errors')}</li>
        </ul>
      </section>

      <section class="about-section about-links">
        <div class="about-links-book">
          <p class="about-links-caption">${t('about.book.intro')}</p>
          <a class="about-links-book-link" href="${t('about.book.url')}" target="_blank">${t('about.book.title')}</a>
        </div>
        <div class="about-links-book">
          <p class="about-links-caption">${t('about.review.intro')}</p>
          <a class="about-links-book-link" href="${t('about.review.url')}" target="_blank">${t('about.review.title')}</a>
        </div>
      </section>

    </div>
  `;

  // Navigate to Explore page when clicking a category coverage row
  contentEl.querySelectorAll<HTMLElement>('.clickable-row[data-category]').forEach((row) => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      navigate('explore', { cat: row.dataset.category! });
    });
  });
}
