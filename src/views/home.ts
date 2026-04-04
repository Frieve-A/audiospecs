import { t } from '../i18n';
import type { ScatterWidgetConfig } from '../components/scatter-widget';
import type { TableWidgetConfig } from '../components/table-widget';

interface ScatterSection {
  type: 'scatter';
  descKey: string;
  config: ScatterWidgetConfig;
}

interface TableSection {
  type: 'table';
  descKey: string;
  config: TableWidgetConfig;
}

type HomeSection = ScatterSection | TableSection;

const SECTIONS: HomeSection[] = [
  // 1. DAC + Headphone Amp: Price vs SINAD, category color
  {
    type: 'scatter',
    descKey: 'home.section.price_sinad',
    config: {
      id: 'price-sinad',
      categories: ['dac', 'headphone_amp'],
      x: 'price_anchor_usd',
      y: 'perf_sinad_db',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 2. DAC + Headphone Amp: Release Year vs SINAD, category color
  {
    type: 'scatter',
    descKey: 'home.section.year_sinad',
    config: {
      id: 'year-sinad',
      categories: ['dac', 'headphone_amp'],
      x: 'release_year',
      y: 'perf_sinad_db',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 3. Table: Headphone Amp, SINAD descending
  {
    type: 'table',
    descKey: 'home.section.top_amp_sinad',
    config: {
      id: 'top-amp-sinad',
      categories: ['headphone_amp'],
      sort: 'perf_sinad_db',
      sortDir: 'desc',
      limit: 10,
      columns: ['perf_sinad_db', 'price_anchor_usd'],
    },
  },
  // 4. Table: DAC, SINAD descending
  {
    type: 'table',
    descKey: 'home.section.top_dac_sinad',
    config: {
      id: 'top-dac-sinad',
      categories: ['dac'],
      sort: 'perf_sinad_db',
      sortDir: 'desc',
      limit: 10,
      columns: ['perf_sinad_db', 'price_anchor_usd'],
    },
  },
  // 5. DAC + Headphone Amp: Price vs SNR, category color
  {
    type: 'scatter',
    descKey: 'home.section.price_snr',
    config: {
      id: 'price-snr',
      categories: ['dac', 'headphone_amp'],
      x: 'price_anchor_usd',
      y: 'perf_snr_db',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 6. DAC + Headphone Amp: Release Year vs SNR, category color
  {
    type: 'scatter',
    descKey: 'home.section.year_snr',
    config: {
      id: 'year-snr',
      categories: ['dac', 'headphone_amp'],
      x: 'release_year',
      y: 'perf_snr_db',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 7. All categories: Release Year vs Freq High, category color
  {
    type: 'scatter',
    descKey: 'home.section.year_freq_high',
    config: {
      id: 'year-freq-high',
      categories: ['headphone', 'iem', 'dac', 'headphone_amp', 'speaker'],
      x: 'release_year',
      y: 'spec_freq_high_hz',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 8. Headphone + IEM: Price vs Freq Low
  {
    type: 'scatter',
    descKey: 'home.section.price_freq_low_hp',
    config: {
      id: 'price-freq-low-hp',
      categories: ['headphone', 'iem'],
      x: 'price_anchor_usd',
      y: 'spec_freq_low_hz',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 9. Speaker: Price vs Freq Low
  {
    type: 'scatter',
    descKey: 'home.section.price_freq_low_spk',
    config: {
      id: 'price-freq-low-spk',
      categories: ['speaker'],
      x: 'price_anchor_usd',
      y: 'spec_freq_low_hz',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 10. Table: Speaker, Freq Low ascending
  {
    type: 'table',
    descKey: 'home.section.top_spk_freq_low',
    config: {
      id: 'top-spk-freq-low',
      categories: ['speaker'],
      sort: 'spec_freq_low_hz',
      sortDir: 'asc',
      limit: 10,
      columns: ['spec_freq_low_hz', 'price_anchor_usd'],
    },
  },
  // 11. All categories: Price vs Weight, category color
  {
    type: 'scatter',
    descKey: 'home.section.price_weight',
    config: {
      id: 'price-weight',
      categories: ['headphone', 'iem', 'dac', 'headphone_amp', 'speaker'],
      x: 'price_anchor_usd',
      y: 'spec_weight_g',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 12. IEM: Price vs Driver Count
  {
    type: 'scatter',
    descKey: 'home.section.price_drivers',
    config: {
      id: 'price-drivers',
      categories: ['iem'],
      x: 'price_anchor_usd',
      y: 'driver_total_count',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 13. Headphone + IEM: Price vs FR Harman Std Dev
  {
    type: 'scatter',
    descKey: 'home.section.price_harman_std',
    config: {
      id: 'price-harman-std',
      categories: ['headphone', 'iem'],
      x: 'price_anchor_usd',
      y: 'perf_fr_harman_std_db',
      color: 'category_primary',
      staticChart: true,
    },
  },
  // 14. Table: Headphone + IEM, FR Harman Std Dev ascending
  {
    type: 'table',
    descKey: 'home.section.top_hp_harman_std',
    config: {
      id: 'top-hp-harman-std',
      categories: ['headphone', 'iem'],
      sort: 'perf_fr_harman_std_db',
      sortDir: 'asc',
      limit: 10,
      columns: ['category_primary', 'perf_fr_harman_std_db', 'price_anchor_usd'],
    },
  },
];

/** Build a hash link to the Analysis tab matching this scatter config */
function scatterLink(config: ScatterWidgetConfig): string {
  const p = new URLSearchParams();
  p.set('cat', config.categories.join(','));
  p.set('x', config.x);
  p.set('y', config.y);
  p.set('color', config.color);
  return `#/analysis?${p.toString()}`;
}

/** Build a hash link to the Explore tab matching this table config */
function tableLink(config: TableWidgetConfig): string {
  const p = new URLSearchParams();
  if (config.categories.length === 1) {
    p.set('cat', config.categories[0]);
  }
  p.set('sort', `${config.sort}:${config.sortDir}`);
  p.set('cols', config.columns.join(','));
  return `#/explore?${p.toString()}`;
}

export async function renderHome(container: HTMLElement): Promise<void> {
  const sectionsHtml = SECTIONS.map((sec, i) => {
    const linkHref = sec.type === 'scatter'
      ? scatterLink(sec.config)
      : tableLink(sec.config);
    const linkLabel = sec.type === 'scatter'
      ? t('home.open_analysis')
      : t('home.open_explore');

    return `
    <section class="home-widget-section" data-section-idx="${i}">
      <div class="home-widget-header">
        <p class="home-widget-desc">${t(sec.descKey)}</p>
        <a class="home-widget-link" href="${linkHref}">${linkLabel} &rarr;</a>
      </div>
      <div class="home-widget-body">
        <div class="home-widget-loading">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </section>
  `;
  }).join('');

  container.innerHTML = `
    <div class="view-header">
      <h1>${t('home.title')}</h1>
      <p>${t('home.subtitle')}</p>
    </div>
    <div class="home-sections">
      ${sectionsHtml}
    </div>
  `;

  // Lazy-render each section when it enters the viewport
  const rendered = new Set<number>();

  async function renderSection(idx: number): Promise<void> {
    if (rendered.has(idx)) return;
    rendered.add(idx);

    const sec = SECTIONS[idx];
    const sectionEl = container.querySelector<HTMLElement>(`[data-section-idx="${idx}"]`);
    if (!sectionEl) return;
    const bodyEl = sectionEl.querySelector<HTMLElement>('.home-widget-body')!;

    try {
      if (sec.type === 'scatter') {
        const { renderScatterWidget } = await import('../components/scatter-widget');
        await renderScatterWidget(bodyEl, sec.config);
      } else {
        const { renderTableWidget } = await import('../components/table-widget');
        await renderTableWidget(bodyEl, sec.config);
      }
    } catch (err) {
      console.error(`Failed to render home section ${idx}:`, err);
      bodyEl.innerHTML = '';
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const idx = parseInt((entry.target as HTMLElement).dataset.sectionIdx!, 10);
        renderSection(idx);
      }
    },
    { rootMargin: '300px' },
  );

  container.querySelectorAll<HTMLElement>('[data-section-idx]').forEach((el) => {
    observer.observe(el);
  });
}
