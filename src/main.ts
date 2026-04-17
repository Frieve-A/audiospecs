declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

import './style.css';
import { initDatabase } from './db/database';
import { onRouteChange, redirectLegacyHash, type Route, type RouteInfo } from './router';
import { renderHome } from './views/home';
import { renderExplore } from './views/explore';
import { renderCompare } from './views/compare';
import { renderAbout } from './views/about';
import { initI18n, t, getLocale, setLocale, onLocaleChange, AVAILABLE_LOCALES } from './i18n';
import { applyTheme, getThemeMode, initTheme, cycleTheme, onThemeChange } from './theme';

/* ── PC / Mobile viewport switching ── */
const VIEWPORT_KEY = 'audiospecs-viewport-mode';
const PC_VIEWPORT = 'width=1200';
const MOBILE_VIEWPORT = 'width=device-width, initial-scale=1.0';

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getViewportMode(): 'pc' | 'mobile' {
  return localStorage.getItem(VIEWPORT_KEY) === 'pc' ? 'pc' : 'mobile';
}

function applyViewportMode(mode: 'pc' | 'mobile'): void {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute('content', mode === 'pc' ? PC_VIEWPORT : MOBILE_VIEWPORT);
  }
}

function toggleViewportMode(): void {
  const next = getViewportMode() === 'pc' ? 'mobile' : 'pc';
  localStorage.setItem(VIEWPORT_KEY, next);
  applyViewportMode(next);
  location.reload();
}

const NAV_ROUTES: Route[] = ['home', 'analysis', 'explore', 'compare', 'about'];
const NAV_LABEL_KEYS: Partial<Record<Route, string>> = {
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
      <a href="/home" class="logo"><img class="logo-icon" src="/assets/images/icon-64x64.png" alt="Frieve logo" />${t('nav.logo')}</a>
      <div class="nav-links" id="nav-links">
      ${NAV_ROUTES.map((route) => `<a href="/${route}" data-route="${route}">${t(NAV_LABEL_KEYS[route]!)}</a>`).join('')}
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
      <button class="theme-toggle" title="Theme"></button>
      </div>
      <div class="nav-toolbar">
      <button class="share-btn" title="${t('common.share')}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8V13a1 1 0 001 1h6a1 1 0 001-1V8"/>
          <polyline points="11 4 8 1 5 4"/>
          <line x1="8" y1="1" x2="8" y2="10"/>
        </svg>
      </button>
      <select class="locale-select">
        ${AVAILABLE_LOCALES.map((l) => `<option value="${l.code}" ${l.code === getLocale() ? 'selected' : ''}>${l.label}</option>`).join('')}
      </select>
      <button class="theme-toggle" title="Theme"></button>
      </div>
      <button id="nav-hamburger" class="nav-hamburger" aria-label="Menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      </div>
    </nav>
    <div id="share-toast" class="share-toast"></div>
    <main class="main-content" id="main-content"></main>
    <footer class="main-footer">
      <div class="footer-inner">
        <a href="https://www.frieve.com" target="_blank">${t('about.link.website')}</a>
        <a href="https://github.com/Frieve-A/audiospecs" target="_blank">${t('about.link.github')}</a>
        <a href="https://ko-fi.com/frievea" target="_blank">${t('about.link.support')}</a>
      </div>
      ${isMobileDevice() ? `
      <div class="footer-viewport-switch">
        <a href="#" id="viewport-toggle">${getViewportMode() === 'pc' ? t('footer.view_mobile') : t('footer.view_pc')}</a>
      </div>` : ''}
    </footer>
  `;

  const hamburger = document.getElementById('nav-hamburger')!;
  const navLinks = document.getElementById('nav-links')!;
  hamburger.addEventListener('click', () => {
    const expanded = navLinks.classList.toggle('open');
    hamburger.classList.toggle('open', expanded);
    hamburger.setAttribute('aria-expanded', String(expanded));
  });
  // Global SPA link interception for internal paths
  document.addEventListener('click', (e) => {
    const anchor = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    // Skip external links and download links
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    e.preventDefault();
    // Close mobile nav if open
    navLinks.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    history.pushState(null, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  document.querySelectorAll('.locale-select').forEach((el) => {
    el.addEventListener('change', (e) => {
      setLocale((e.target as HTMLSelectElement).value as 'en' | 'ja');
    });
  });

  document.querySelectorAll('.share-btn').forEach((el) => {
    el.addEventListener('click', async () => {
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
  });

  // Theme toggle
  initTheme();
  document.querySelectorAll('.theme-toggle').forEach((el) => {
    el.addEventListener('click', () => cycleTheme());
  });

  // Viewport toggle (mobile only)
  const vpToggle = document.getElementById('viewport-toggle');
  if (vpToggle) {
    vpToggle.addEventListener('click', (e) => {
      e.preventDefault();
      toggleViewportMode();
    });
  }

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
  // Redirect legacy #/ URLs to clean paths
  redirectLegacyHash();

  // Apply theme early to avoid flash of wrong theme
  applyTheme(getThemeMode());
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
    product: async (el, params) => {
      const { renderProduct } = await import('./views/product');
      await renderProduct(el, params);
    },
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

  // Re-render current view on theme change (shell CSS updates automatically)
  onThemeChange(() => {
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

    // Send GA4 page_view for SPA navigation
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

// Apply saved viewport mode before rendering
if (isMobileDevice()) {
  applyViewportMode(getViewportMode());
}

main();
