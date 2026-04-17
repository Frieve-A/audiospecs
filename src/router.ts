export type Route = 'home' | 'analysis' | 'explore' | 'compare' | 'about' | 'product';

export interface RouteInfo {
  route: Route;
  params: URLSearchParams;
}

const ROUTE_MAP: Record<string, Route> = {
  '': 'home',
  home: 'home',
  analysis: 'analysis',
  explore: 'explore',
  compare: 'compare',
  about: 'about',
  product: 'product',
};

export function parsePath(pathname: string, search: string): RouteInfo {
  // Strip leading slash and base path
  const clean = pathname.replace(/^\//, '');
  const segments = clean.split('/');
  const segment = segments[0];
  const route = ROUTE_MAP[segment] || 'home';
  const params = new URLSearchParams(search);

  // For /product/{brand}/{product} paths, extract brand/product into params
  if (route === 'product' && segments.length >= 3) {
    params.set('brand', decodeURIComponent(segments[1]));
    params.set('product', decodeURIComponent(segments.slice(2).join('/')));
  }

  return { route, params };
}

/** Redirect legacy #/ URLs to clean paths. Returns true if redirected. */
export function redirectLegacyHash(): boolean {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#/')) return false;

  const clean = hash.replace(/^#\/?/, '');
  const [path, qs] = clean.split('?');
  const newUrl = `/${path || 'home'}${qs ? '?' + qs : ''}`;
  history.replaceState(null, '', newUrl);
  return true;
}

export function navigate(route: Route, params?: Record<string, string>): void {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `/${route}${qs}`;
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function onRouteChange(cb: (info: RouteInfo) => void): void {
  const handler = () => cb(parsePath(window.location.pathname, window.location.search));
  window.addEventListener('popstate', handler);
  handler();
}
