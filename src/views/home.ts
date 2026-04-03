import { query } from '../db/database';
import { PRESETS, getCategoryLabel, getPresetPurpose } from '../presets';
import { navigate } from '../router';
import { t } from '../i18n';

export async function renderHome(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="view-header">
      <h1>${t('home.title')}</h1>
      <p>${t('home.subtitle')}</p>
    </div>
    <div class="stats-grid" id="home-stats"></div>
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">${t('home.card.category_dist')}</div>
      <div class="card-body" id="home-categories"></div>
    </div>
    <div class="card">
      <div class="card-header">${t('home.card.quick_analysis')}</div>
      <div class="card-body" id="home-presets"></div>
    </div>
  `;

  const [manifest] = await query<{ value: string }>(
    "SELECT value FROM web_manifest WHERE key = 'product_count'",
  );
  const [brandCount] = await query<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM web_brand_summary',
  );
  const [perfCount] = await query<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM web_product_core WHERE has_perf_data = 1',
  );
  const [priceCount] = await query<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM web_product_core WHERE coalesce(street_price_usd, msrp_usd) IS NOT NULL",
  );
  const catDist = await query<{ category_primary: string; cnt: number }>(
    'SELECT category_primary, COUNT(*) as cnt FROM web_product_core GROUP BY category_primary ORDER BY cnt DESC',
  );

  const statsEl = document.getElementById('home-stats')!;
  const totalProducts = manifest ? Number(manifest.value) : 0;
  statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalProducts.toLocaleString()}</div><div class="stat-label">${t('home.stat.products')}</div></div>
    <div class="stat-card"><div class="stat-value">${brandCount.cnt}</div><div class="stat-label">${t('home.stat.brands')}</div></div>
    <div class="stat-card"><div class="stat-value">${perfCount.cnt}</div><div class="stat-label">${t('home.stat.with_perf')}</div></div>
    <div class="stat-card"><div class="stat-value">${priceCount.cnt}</div><div class="stat-label">${t('home.stat.with_price')}</div></div>
  `;

  const catEl = document.getElementById('home-categories')!;
  catEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:0.75rem">
      ${catDist.map((c) => `
        <div class="stat-card" style="min-width:150px;cursor:pointer" data-cat="${c.category_primary}">
          <div class="stat-value">${c.cnt}</div>
          <div class="stat-label">${getCategoryLabel(c.category_primary)}</div>
        </div>
      `).join('')}
    </div>
  `;
  catEl.querySelectorAll('[data-cat]').forEach((el) => {
    el.addEventListener('click', () => {
      navigate('explore', { cat: (el as HTMLElement).dataset.cat! });
    });
  });

  const presetsEl = document.getElementById('home-presets')!;
  const featured = PRESETS.slice(0, 6);
  presetsEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
      ${featured.map((p) => {
        const purpose = getPresetPurpose(p);
        return `
        <button class="preset-btn" data-preset="${p.id}" title="${purpose}">
          ${purpose}
        </button>
      `;
      }).join('')}
    </div>
  `;
  presetsEl.querySelectorAll('[data-preset]').forEach((el) => {
    el.addEventListener('click', () => {
      navigate('analysis', { preset: (el as HTMLElement).dataset.preset! });
    });
  });
}
