export type Route = 'home' | 'analysis' | 'explore' | 'compare' | 'about';

export interface RouteInfo {
  route: Route;
  params: URLSearchParams;
}

export function parseHash(hash: string): RouteInfo {
  const clean = hash.replace(/^#\/?/, '');
  const [path, qs] = clean.split('?');
  const params = new URLSearchParams(qs || '');

  const routeMap: Record<string, Route> = {
    '': 'home',
    home: 'home',
    analysis: 'analysis',
    explore: 'explore',
    compare: 'compare',
    about: 'about',
  };

  const segment = (path || '').split('/')[0];
  const route = routeMap[segment] || 'home';
  return { route, params };
}

export function navigate(route: Route, params?: Record<string, string>): void {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  window.location.hash = `#/${route}${qs}`;
}

export function onRouteChange(cb: (info: RouteInfo) => void): void {
  const handler = () => cb(parseHash(window.location.hash));
  window.addEventListener('hashchange', handler);
  handler();
}
