declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

import './style.css';
import { initDatabase } from './db/database';
import { onRouteChange, type Route, type RouteInfo } from './router';
import { renderHome } from './views/home';
import { renderExplore } from './views/explore';
import { renderCompare } from './views/compare';
import { renderAbout } from './views/about';
import { initI18n, t, getLocale, setLocale, onLocaleChange, AVAILABLE_LOCALES } from './i18n';

const NAV_ROUTES: Route[] = ['home', 'analysis', 'explore', 'compare', 'about'];
const NAV_LABEL_KEYS: Record<Route, string> = {
  home: 'nav.home',
  analysis: 'nav.analysis',
  explore: 'nav.explore',
  compare: 'nav.compare',
  about: 'nav.about',
};

function createShell(): { nav: HTMLElement; content: HTMLElement } {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <nav class="main-nav">
      <div class="nav-inner">
      <span class="logo"><img class="logo-icon" src="/assets/images/icon-64x64.png" alt="Frieve logo" />${t('nav.logo')}</span>
      ${NAV_ROUTES.map((route) => `<a href="#/${route}" data-route="${route}">${t(NAV_LABEL_KEYS[route])}</a>`).join('')}
      <div class="nav-spacer"></div>
      <button id="share-btn" class="share-btn" title="${t('common.share')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8V13a1 1 0 001 1h6a1 1 0 001-1V8"/>
          <polyline points="11 4 8 1 5 4"/>
          <line x1="8" y1="1" x2="8" y2="10"/>
        </svg>
        <span>${t('common.share')}</span>
      </button>
      <select id="locale-select" class="locale-select">
        ${AVAILABLE_LOCALES.map((l) => `<option value="${l.code}" ${l.code === getLocale() ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
      </div>
    </nav>
    <div id="share-toast" class="share-toast"></div>
    <main class="main-content" id="main-content"></main>
  `;

  document.getElementById('locale-select')!.addEventListener('change', (e) => {
    setLocale((e.target as HTMLSelectElement).value as 'en' | 'ja');
  });

  document.getElementById('share-btn')!.addEventListener('click', async () => {
    const url = window.location.href;
    const toast = document.getElementById('share-toast')!;
    try {
      await navigator.clipboard.writeText(url);
      toast.textContent = t('common.share.copied');
      toast.classList.add('show');
    } catch {
      toast.textContent = t('common.share.failed');
      toast.classList.add('show');
    }
    setTimeout(() => toast.classList.remove('show'), 2000);
  });

  return {
    nav: app.querySelector('nav')!,
    content: document.getElementById('main-content')!,
  };
}

function showLoading(content: HTMLElement, message?: string): void {
  content.innerHTML = `
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">${message ?? t('common.loading_database')}</div>
    </div>
  `;
}

function updateNav(nav: HTMLElement, route: Route): void {
  nav.querySelectorAll('a[data-route]').forEach((a) => {
    a.classList.toggle('active', (a as HTMLElement).dataset.route === route);
  });
}

async function main(): Promise<void> {
  initI18n();
  document.title = t('page.title');

  let shell = createShell();
  showLoading(shell.content);

  try {
    await initDatabase();
  } catch (err) {
    shell.content.innerHTML = `
      <div class="loading-overlay">
        <div style="color:var(--danger);font-weight:600">${t('common.error.db_load')}</div>
        <div class="loading-text">${(err as Error).message}</div>
        <button onclick="location.reload()" class="primary" style="margin-top:1rem">${t('common.retry')}</button>
      </div>
    `;
    return;
  }

  const renderers: Record<Route, (el: HTMLElement, params: URLSearchParams) => Promise<void>> = {
    home: (el) => renderHome(el),
    analysis: async (el, params) => {
      const { renderAnalysis } = await import('./views/analysis');
      await renderAnalysis(el, params);
    },
    explore: renderExplore,
    compare: renderCompare,
    about: renderAbout,
  };

  let currentRoute: string | null = null;
  let lastRouteInfo: RouteInfo | null = null;

  async function renderCurrentRoute(): Promise<void> {
    if (!lastRouteInfo) return;
    const info = lastRouteInfo;
    updateNav(shell.nav, info.route);
    showLoading(shell.content, t('common.loading'));

    try {
      const renderer = renderers[info.route];
      if (renderer) {
        await renderer(shell.content, info.params);
      } else {
        shell.content.innerHTML = `<div class="loading-overlay"><div>${t('common.not_found')}</div></div>`;
      }
    } catch (err) {
      console.error('View render error:', err);
      shell.content.innerHTML = `
        <div class="loading-overlay">
          <div style="color:var(--danger);font-weight:600">${t('common.error.render')}</div>
          <div class="loading-text">${(err as Error).message}</div>
        </div>
      `;
    }
  }

  // Re-render shell + current view on locale change
  onLocaleChange(() => {
    const prevRoute = lastRouteInfo?.route;
    shell = createShell();
    if (prevRoute) updateNav(shell.nav, prevRoute);
    currentRoute = null; // force re-render
    renderCurrentRoute();
  });

  onRouteChange(async (info: RouteInfo) => {
    const routeKey = info.route + '?' + info.params.toString();
    if (routeKey === currentRoute) return;
    currentRoute = routeKey;
    lastRouteInfo = info;

    // Update page title per route
    const titleKey = `page.title.${info.route}`;
    document.title = t(titleKey) || t('page.title');

    // Send GA4 page_view for hash-based navigation
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_title: document.title,
        page_location: window.location.href,
        page_path: `/${info.route}`,
      });
    }

    await renderCurrentRoute();
  });
}

main();
