/**
 * Router Implementation
 * 
 * Concrete implementation of IRouter.
 * Handles route matching, parameter extraction, and wildcards.
 */

import { IRouter } from '../interfaces/IRouter';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  Route,
  RouteMatch,
  RouterConfig,
  HttpMethod,
} from '../types/router-types';

export class Router implements IRouter {
  private _routes: Route[];
  private _config: RouterConfig;

  constructor() {
    this._routes = [];
    this._config = {
      caseSensitive: true,
      strictRouting: false,
      allowWildcards: true,
    };
  }

  registerRoute(route: Route): void {
    this._routes.push(route);
  }

  match(request: HttpRequest): RouteMatch {
    const method = request.line.method as HttpMethod;
    const path = request.line.path;

    const matchingRoute = this._routes.find((route) => {
      if (route.method !== method) {
        return false;
      }

      return this._matchPath(route.path, path);
    });

    if (!matchingRoute) {
      return { matched: false };
    }

    const parameters = this._extractParameters(matchingRoute.path, path);
    const wildcard = path.includes('*');

    return {
      matched: true,
      route: matchingRoute,
      parameters,
      wildcard,
    };
  }

  getRoutes(): Route[] {
    return [...this._routes];
  }

  removeRoute(method: HttpMethod, path: string): void {
    this._routes = this._routes.filter(
      (route) => route.method !== method || route.path !== path
    );
  }

  clearRoutes(): void {
    this._routes = [];
  }

  setConfig(config: RouterConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): RouterConfig {
    return { ...this._config };
  }

  private _matchPath(routePath: string, requestPath: string): boolean {
    const routePathNormalized = this._config.caseSensitive ? routePath : routePath.toLowerCase();
    const requestPathNormalized = this._config.caseSensitive ? requestPath : requestPath.toLowerCase();

    if (routePathNormalized === requestPathNormalized) {
      return true;
    }

    if (this._config.allowWildcards && routePathNormalized.includes('*')) {
      const pattern = routePathNormalized.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(requestPathNormalized);
    }

    const routeSegments = routePathNormalized.split('/');
    const requestSegments = requestPathNormalized.split('/');

    if (routeSegments.length !== requestSegments.length) {
      if (!this._config.strictRouting) {
        return false;
      }
    }

    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];
      const requestSegment = requestSegments[i];

      if (!routeSegment || !requestSegment) {
        return false;
      }

      if (routeSegment.startsWith(':')) {
        continue;
      }

      if (routeSegment !== requestSegment) {
        return false;
      }
    }

    return true;
  }

  private _extractParameters(routePath: string, requestPath: string): Record<string, string> {
    const parameters: Record<string, string> = {};
    const routeSegments = routePath.split('/');
    const requestSegments = requestPath.split('/');

    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];

      if (routeSegment && routeSegment.startsWith(':')) {
        const paramName = routeSegment.substring(1);
        const paramValue = requestSegments[i] || '';
        parameters[paramName] = paramValue;
      }
    }

    return parameters;
  }
}
