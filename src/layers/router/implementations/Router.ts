/**
 * Router Implementation
 * 
 * Concrete implementation of IRouter.
 * Handles route matching, parameter extraction, wildcards,
 * route groups, caching, statistics, and advanced filtering.
 */

import { IRouter } from '../interfaces/IRouter';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  Route,
  RouteMatch,
  RouterConfig,
  HttpMethod,
  RouteGroup,
  RouteStatistics,
  RouteFilter,
  MiddlewareDefinition,
  ValidationResult,
  RouteMetadata,
  RouteStatus,
  RoutePriority,
  ValidationError,
  ValidationWarning,
  CacheEntry,
} from '../types/router-types';

export class Router implements IRouter {
  private _routes: Route[];
  private _config: RouterConfig;
  private _routeGroups: RouteGroup[];
  private _middleware: MiddlewareDefinition[];
  private _cache: Map<string, CacheEntry>;
  private _statistics: RouteStatistics;
  private _routeMetadata: Map<string, RouteMetadata>;

  constructor() {
    this._routes = [];
    this._routeGroups = [];
    this._middleware = [];
    this._cache = new Map();
    this._routeMetadata = new Map();
    this._config = {
      caseSensitive: true,
      strictRouting: false,
      allowWildcards: true,
      enableCaching: false,
      cacheTTL: 60000,
      enableMetrics: false,
      enableLogging: false,
      maxRoutes: 1000,
      defaultPriority: RoutePriority.MEDIUM,
      defaultCache: 'NONE' as any,
    };
    this._statistics = this._initStatistics();
  }

  private _initStatistics(): RouteStatistics {
    return {
      totalRoutes: 0,
      activeRoutes: 0,
      disabledRoutes: 0,
      deprecatedRoutes: 0,
      totalMatches: 0,
      totalMisses: 0,
      averageMatchTime: 0,
      routesByMethod: {} as Record<HttpMethod, number>,
      routesByPriority: {} as Record<RoutePriority, number>,
    };
  }

  private _generateRouteKey(method: HttpMethod, path: string): string {
    return `${method}:${path}`;
  }

  registerRoute(route: Route): void {
    if (this._routes.length >= this._config.maxRoutes) {
      throw new Error(`Maximum routes limit (${this._config.maxRoutes}) reached`);
    }

    const routeWithDefaults: Route = {
      priority: this._config.defaultPriority,
      status: RouteStatus.ACTIVE,
      ...route,
    };

    this._routes.push(routeWithDefaults);
    this._updateStatistics();
    this._updateRouteMetadata(routeWithDefaults);
  }

  match(request: HttpRequest): RouteMatch {
    const startTime = Date.now();
    const method = request.line.method as HttpMethod;
    const path = request.line.path;

    const cacheKey = this._generateRouteKey(method, path);

    if (this._config.enableCaching) {
      const cached = this._cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        this._statistics.totalMatches++;
        return cached.route;
      }
    }

    const matchingRoute = this._routes.find((route) => {
      if (route.status !== RouteStatus.ACTIVE) {
        return false;
      }

      if (route.method !== method) {
        return false;
      }

      return this._matchPath(route.path, path);
    });

    if (!matchingRoute) {
      this._statistics.totalMisses++;
      return { matched: false };
    }

    const parameters = this._extractParameters(matchingRoute.path, path);
    const wildcard = path.includes('*');
    const matchTime = Date.now() - startTime;

    const result: RouteMatch = {
      matched: true,
      route: matchingRoute,
      parameters,
      wildcard,
      matchedSegments: path.split('/'),
      matchedPattern: matchingRoute.path,
      matchTime,
    };

    if (this._config.enableCaching) {
      this._cache.set(cacheKey, {
        key: cacheKey,
        route: result,
        timestamp: Date.now(),
        ttl: this._config.cacheTTL,
      });
    }

    this._statistics.totalMatches++;
    this._updateAverageMatchTime(matchTime);

    return result;
  }

  getRoutes(): Route[] {
    return [...this._routes];
  }

  removeRoute(method: HttpMethod, path: string): void {
    const key = this._generateRouteKey(method, path);
    this._routes = this._routes.filter(
      (route) => route.method !== method || route.path !== path
    );
    this._cache.delete(key);
    this._routeMetadata.delete(key);
    this._updateStatistics();
  }

  clearRoutes(): void {
    this._routes = [];
    this._cache.clear();
    this._routeMetadata.clear();
    this._statistics = this._initStatistics();
  }

  setConfig(config: RouterConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): RouterConfig {
    return { ...this._config };
  }

  registerRouteGroup(group: RouteGroup): void {
    this._routeGroups.push(group);
    group.routes.forEach(route => {
      const routeWithGroup = {
        ...route,
        group: group.name,
        middleware: [...(group.middleware || []), ...(route.middleware || [])],
      };
      this.registerRoute(routeWithGroup);
    });
  }

  removeRouteGroup(name: string): void {
    this._routeGroups = this._routeGroups.filter(g => g.name !== name);
    this._routes = this._routes.filter(r => r.group !== name);
    this._updateStatistics();
  }

  getRouteGroups(): RouteGroup[] {
    return [...this._routeGroups];
  }

  getFilteredRoutes(filter: RouteFilter): Route[] {
    let filtered = [...this._routes];

    if (filter.method) {
      filtered = filtered.filter(r => r.method === filter.method);
    }

    if (filter.path) {
      filtered = filtered.filter(r => r.path === filter.path);
    }

    if (filter.pathPattern) {
      const regex = new RegExp(filter.pathPattern);
      filtered = filtered.filter(r => regex.test(r.path));
    }

    if (filter.priority) {
      filtered = filtered.filter(r => r.priority === filter.priority);
    }

    if (filter.status) {
      filtered = filtered.filter(r => r.status === filter.status);
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter(r =>
        filter.tags!.some(tag => r.tags?.includes(tag))
      );
    }

    if (filter.group) {
      filtered = filtered.filter(r => r.group === filter.group);
    }

    if (filter.version) {
      filtered = filtered.filter(r => r.version === filter.version);
    }

    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  getRoute(method: HttpMethod, path: string): Route | undefined {
    return this._routes.find(r => r.method === method && r.path === path);
  }

  updateRoute(method: HttpMethod, path: string, updates: Partial<Route>): void {
    const index = this._routes.findIndex(r => r.method === method && r.path === path);
    if (index !== -1) {
      this._routes[index] = { ...this._routes[index], ...updates };
      const updatedRoute = this._routes[index];
      if (updatedRoute && updatedRoute.method && updatedRoute.path) {
        this._updateRouteMetadata(updatedRoute);
      }
    }
  }

  enableRoute(method: HttpMethod, path: string): void {
    this.setRouteStatus(method, path, RouteStatus.ACTIVE);
  }

  disableRoute(method: HttpMethod, path: string): void {
    this.setRouteStatus(method, path, RouteStatus.DISABLED);
  }

  setRouteStatus(method: HttpMethod, path: string, status: RouteStatus): void {
    this.updateRoute(method, path, { status });
    this._updateStatistics();
  }

  setRoutePriority(method: HttpMethod, path: string, priority: RoutePriority): void {
    this.updateRoute(method, path, { priority });
    this._updateStatistics();
  }

  registerMiddleware(middleware: MiddlewareDefinition): void {
    this._middleware.push(middleware);
  }

  removeMiddleware(name: string): void {
    this._middleware = this._middleware.filter(m => m.name !== name);
  }

  getMiddleware(): MiddlewareDefinition[] {
    return [...this._middleware];
  }

  enableMiddleware(name: string): void {
    const middleware = this._middleware.find(m => m.name === name);
    if (middleware) {
      middleware.enabled = true;
    }
  }

  disableMiddleware(name: string): void {
    const middleware = this._middleware.find(m => m.name === name);
    if (middleware) {
      middleware.enabled = false;
    }
  }

  getStatistics(): RouteStatistics {
    return { ...this._statistics };
  }

  resetStatistics(): void {
    this._statistics = this._initStatistics();
  }

  validateRoute(route: Route): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!route.path || route.path === '') {
      errors.push({
        path: route.path,
        field: 'path',
        message: 'Path is required',
        code: 'REQUIRED',
      });
    }

    if (!route.handler || route.handler === '') {
      errors.push({
        path: route.path,
        field: 'handler',
        message: 'Handler is required',
        code: 'REQUIRED',
      });
    }

    if (route.parameters) {
      route.parameters.forEach(param => {
        if (!param.name || param.name === '') {
          errors.push({
            path: route.path,
            field: 'parameter.name',
            message: 'Parameter name is required',
            code: 'REQUIRED',
          });
        }

        if (param.pattern && param.required && !param.defaultValue) {
          warnings.push({
            path: route.path,
            field: 'parameter',
            message: 'Required parameter with pattern should have default value',
            code: 'BEST_PRACTICE',
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateAllRoutes(): ValidationResult[] {
    return this._routes.map(route => this.validateRoute(route));
  }

  getRouteMetadata(method: HttpMethod, path: string): RouteMetadata | undefined {
    const key = this._generateRouteKey(method, path);
    return this._routeMetadata.get(key);
  }

  getAllRouteMetadata(): RouteMetadata[] {
    return Array.from(this._routeMetadata.values());
  }

  clearCache(): void {
    this._cache.clear();
  }

  getCacheSize(): number {
    return this._cache.size;
  }

  getRoutesByTag(tag: string): Route[] {
    return this._routes.filter(r => r.tags?.includes(tag));
  }

  getRoutesByGroup(group: string): Route[] {
    return this._routes.filter(r => r.group === group);
  }

  getRoutesByMethod(method: HttpMethod): Route[] {
    return this._routes.filter(r => r.method === method);
  }

  getRoutesByStatus(status: RouteStatus): Route[] {
    return this._routes.filter(r => r.status === status);
  }

  getRoutesByPriority(priority: RoutePriority): Route[] {
    return this._routes.filter(r => r.priority === priority);
  }

  private _updateStatistics(): void {
    this._statistics.totalRoutes = this._routes.length;
    this._statistics.activeRoutes = this._routes.filter(r => r.status === RouteStatus.ACTIVE).length;
    this._statistics.disabledRoutes = this._routes.filter(r => r.status === RouteStatus.DISABLED).length;
    this._statistics.deprecatedRoutes = this._routes.filter(r => r.status === RouteStatus.DEPRECATED).length;

    this._statistics.routesByMethod = {} as Record<HttpMethod, number>;
    this._routes.forEach(route => {
      this._statistics.routesByMethod[route.method] = (this._statistics.routesByMethod[route.method] || 0) + 1;
    });

    this._statistics.routesByPriority = {} as Record<RoutePriority, number>;
    this._routes.forEach(route => {
      this._statistics.routesByPriority[route.priority || RoutePriority.MEDIUM] = (this._statistics.routesByPriority[route.priority || RoutePriority.MEDIUM] || 0) + 1;
    });
  }

  private _updateRouteMetadata(route: Route): void {
    const key = this._generateRouteKey(route.method, route.path);
    const metadata: RouteMetadata = {
      path: route.path,
      method: route.method,
      handler: route.handler,
      parameters: route.parameters || [],
      middleware: route.middleware || [],
      tags: route.tags || [],
      description: route.description || '',
      version: route.version || '',
      group: route.group || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this._routeMetadata.set(key, metadata);
  }

  private _updateAverageMatchTime(matchTime: number): void {
    const totalMatches = this._statistics.totalMatches + this._statistics.totalMisses;
    if (totalMatches > 0) {
      this._statistics.averageMatchTime = 
        (this._statistics.averageMatchTime * (totalMatches - 1) + matchTime) / totalMatches;
    }
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
