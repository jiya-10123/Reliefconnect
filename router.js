'use strict';

/**
 * A minimal router (no Express needed). Supports static and :param
 * path segments, e.g. "/api/requests/:id".
 */
class Router {
  constructor() {
    this.routes = []; // { method, segments, handler }
  }

  _register(method, path, handler) {
    const segments = path.split('/').filter(Boolean);
    this.routes.push({ method, segments, handler });
  }

  get(path, handler) { this._register('GET', path, handler); }
  post(path, handler) { this._register('POST', path, handler); }
  patch(path, handler) { this._register('PATCH', path, handler); }
  put(path, handler) { this._register('PUT', path, handler); }
  delete(path, handler) { this._register('DELETE', path, handler); }

  match(method, pathname) {
    const requestSegments = pathname.split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== requestSegments.length) continue;

      const params = {};
      let matched = true;

      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i];
        const reqSeg = requestSegments[i];

        if (routeSeg.startsWith(':')) {
          params[routeSeg.slice(1)] = decodeURIComponent(reqSeg);
        } else if (routeSeg !== reqSeg) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { handler: route.handler, params };
      }
    }

    return null;
  }
}

module.exports = Router;
