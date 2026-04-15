/**
 * Router Advanced Tests
 * 
 * Advanced tests for Router implementation.
 * Tests route groups, filtering, middleware, statistics, validation, and metadata.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Router } from '../implementations/Router';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  HttpMethod,
  Route,
  RouteGroup,
  RouteFilter,
  MiddlewareDefinition,
  RoutePriority,
  RouteStatus,
} from '../types/router-types';

describe('Router Advanced', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe('Route Groups', () => {
    it('should register route group', () => {
      const group: RouteGroup = {
        name: 'api',
        prefix: '/api',
        middleware: ['auth'],
        routes: [
          {
            method: HttpMethod.GET,
            path: '/api/users',
            handler: 'getUsers',
          },
          {
            method: HttpMethod.POST,
            path: '/api/users',
            handler: 'createUser',
          },
        ],
      };

      router.registerRouteGroup(group);

      const routes = router.getRoutes();
      expect(routes.length).toBe(2);
      expect(routes[0].group).toBe('api');
      expect(routes[0].middleware).toContain('auth');
    });

    it('should remove route group', () => {
      const group: RouteGroup = {
        name: 'api',
        prefix: '/api',
        routes: [
          {
            method: HttpMethod.GET,
            path: '/api/users',
            handler: 'getUsers',
          },
        ],
      };

      router.registerRouteGroup(group);
      router.removeRouteGroup('api');

      const routes = router.getRoutes();
      expect(routes.length).toBe(0);
    });

    it('should get route groups', () => {
      const group: RouteGroup = {
        name: 'api',
        prefix: '/api',
        routes: [],
      };

      router.registerRouteGroup(group);

      const groups = router.getRouteGroups();
      expect(groups.length).toBe(1);
      expect(groups[0].name).toBe('api');
    });
  });

  describe('Route Filtering', () => {
    beforeEach(() => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        priority: RoutePriority.HIGH,
        status: RouteStatus.ACTIVE,
        tags: ['api', 'users'],
        group: 'api',
        version: 'v1',
      });

      router.registerRoute({
        method: HttpMethod.POST,
        path: '/users',
        handler: 'createUser',
        priority: RoutePriority.MEDIUM,
        status: RouteStatus.DISABLED,
        tags: ['api', 'users'],
        group: 'api',
        version: 'v1',
      });
    });

    it('should filter routes by method', () => {
      const filter: RouteFilter = { method: HttpMethod.GET };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(1);
      expect(filtered[0].method).toBe(HttpMethod.GET);
    });

    it('should filter routes by priority', () => {
      const filter: RouteFilter = { priority: RoutePriority.HIGH };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(1);
      expect(filtered[0].priority).toBe(RoutePriority.HIGH);
    });

    it('should filter routes by status', () => {
      const filter: RouteFilter = { status: RouteStatus.ACTIVE };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(1);
      expect(filtered[0].status).toBe(RouteStatus.ACTIVE);
    });

    it('should filter routes by tags', () => {
      const filter: RouteFilter = { tags: ['api'] };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(2);
    });

    it('should filter routes by group', () => {
      const filter: RouteFilter = { group: 'api' };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(2);
    });

    it('should filter routes by version', () => {
      const filter: RouteFilter = { version: 'v1' };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(2);
    });

    it('should limit filtered routes', () => {
      const filter: RouteFilter = { limit: 1 };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(1);
    });
  });

  describe('Route Management', () => {
    it('should get route by method and path', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      const route = router.getRoute(HttpMethod.GET, '/users');
      expect(route).toBeDefined();
      expect(route?.path).toBe('/users');
    });

    it('should update route', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.updateRoute(HttpMethod.GET, '/users', { priority: RoutePriority.HIGH });

      const route = router.getRoute(HttpMethod.GET, '/users');
      expect(route?.priority).toBe(RoutePriority.HIGH);
    });

    it('should enable route', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        status: RouteStatus.DISABLED,
      });

      router.enableRoute(HttpMethod.GET, '/users');

      const route = router.getRoute(HttpMethod.GET, '/users');
      expect(route?.status).toBe(RouteStatus.ACTIVE);
    });

    it('should disable route', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        status: RouteStatus.ACTIVE,
      });

      router.disableRoute(HttpMethod.GET, '/users');

      const route = router.getRoute(HttpMethod.GET, '/users');
      expect(route?.status).toBe(RouteStatus.DISABLED);
    });

    it('should set route status', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.setRouteStatus(HttpMethod.GET, '/users', RouteStatus.DEPRECATED);

      const route = router.getRoute(HttpMethod.GET, '/users');
      expect(route?.status).toBe(RouteStatus.DEPRECATED);
    });

    it('should set route priority', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.setRoutePriority(HttpMethod.GET, '/users', RoutePriority.CRITICAL);

      const route = router.getRoute(HttpMethod.GET, '/users');
      expect(route?.priority).toBe(RoutePriority.CRITICAL);
    });
  });

  describe('Middleware Management', () => {
    it('should register middleware', () => {
      const middleware: MiddlewareDefinition = {
        name: 'auth',
        order: 'BEFORE',
        handler: 'authHandler',
        enabled: true,
      };

      router.registerMiddleware(middleware);

      const middlewareList = router.getMiddleware();
      expect(middlewareList.length).toBe(1);
      expect(middlewareList[0].name).toBe('auth');
    });

    it('should remove middleware', () => {
      const middleware: MiddlewareDefinition = {
        name: 'auth',
        order: 'BEFORE',
        handler: 'authHandler',
        enabled: true,
      };

      router.registerMiddleware(middleware);
      router.removeMiddleware('auth');

      const middlewareList = router.getMiddleware();
      expect(middlewareList.length).toBe(0);
    });

    it('should enable middleware', () => {
      const middleware: MiddlewareDefinition = {
        name: 'auth',
        order: 'BEFORE',
        handler: 'authHandler',
        enabled: false,
      };

      router.registerMiddleware(middleware);
      router.enableMiddleware('auth');

      const middlewareList = router.getMiddleware();
      expect(middlewareList[0].enabled).toBe(true);
    });

    it('should disable middleware', () => {
      const middleware: MiddlewareDefinition = {
        name: 'auth',
        order: 'BEFORE',
        handler: 'authHandler',
        enabled: true,
      };

      router.registerMiddleware(middleware);
      router.disableMiddleware('auth');

      const middlewareList = router.getMiddleware();
      expect(middlewareList[0].enabled).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should get statistics', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        status: RouteStatus.ACTIVE,
      });

      router.registerRoute({
        method: HttpMethod.POST,
        path: '/users',
        handler: 'createUser',
        status: RouteStatus.DISABLED,
      });

      const stats = router.getStatistics();
      expect(stats.totalRoutes).toBe(2);
      expect(stats.activeRoutes).toBe(1);
      expect(stats.disabledRoutes).toBe(1);
    });

    it('should reset statistics', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.resetStatistics();

      const stats = router.getStatistics();
      expect(stats.totalRoutes).toBe(0);
    });
  });

  describe('Validation', () => {
    it('should validate valid route', () => {
      const route: Route = {
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      };

      const result = router.validateRoute(route);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should validate invalid route with missing path', () => {
      const route: Route = {
        method: HttpMethod.GET,
        path: '',
        handler: 'getUsers',
      };

      const result = router.validateRoute(route);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate invalid route with missing handler', () => {
      const route: Route = {
        method: HttpMethod.GET,
        path: '/users',
        handler: '',
      };

      const result = router.validateRoute(route);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate all routes', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.registerRoute({
        method: HttpMethod.GET,
        path: '',
        handler: 'test',
      });

      const results = router.validateAllRoutes();
      expect(results.length).toBe(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
    });
  });

  describe('Metadata', () => {
    it('should get route metadata', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      const metadata = router.getRouteMetadata(HttpMethod.GET, '/users');
      expect(metadata).toBeDefined();
      expect(metadata?.path).toBe('/users');
      expect(metadata?.method).toBe(HttpMethod.GET);
    });

    it('should get all route metadata', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.registerRoute({
        method: HttpMethod.POST,
        path: '/users',
        handler: 'createUser',
      });

      const metadataList = router.getAllRouteMetadata();
      expect(metadataList.length).toBe(2);
    });
  });

  describe('Cache', () => {
    it('should clear cache', () => {
      router.setConfig({ enableCaching: true });

      const request: HttpRequest = {
        line: { method: HttpMethod.GET, path: '/users', version: 'HTTP/1.1' },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /users HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.match(request);
      expect(router.getCacheSize()).toBeGreaterThan(0);

      router.clearCache();
      expect(router.getCacheSize()).toBe(0);
    });

    it('should get cache size', () => {
      router.setConfig({ enableCaching: true });

      const request: HttpRequest = {
        line: { method: HttpMethod.GET, path: '/users', version: 'HTTP/1.1' },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /users HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      router.match(request);
      expect(router.getCacheSize()).toBeGreaterThan(0);
    });
  });

  describe('Route Queries', () => {
    beforeEach(() => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        tags: ['api', 'users'],
        group: 'api',
        status: RouteStatus.ACTIVE,
        priority: RoutePriority.HIGH,
      });

      router.registerRoute({
        method: HttpMethod.POST,
        path: '/users',
        handler: 'createUser',
        tags: ['api', 'users'],
        group: 'api',
        status: RouteStatus.ACTIVE,
        priority: RoutePriority.MEDIUM,
      });

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/posts',
        handler: 'getPosts',
        tags: ['api', 'posts'],
        group: 'api',
        status: RouteStatus.DISABLED,
        priority: RoutePriority.LOW,
      });
    });

    it('should get routes by tag', () => {
      const routes = router.getRoutesByTag('users');
      expect(routes.length).toBe(2);
    });

    it('should get routes by group', () => {
      const routes = router.getRoutesByGroup('api');
      expect(routes.length).toBe(3);
    });

    it('should get routes by method', () => {
      const routes = router.getRoutesByMethod(HttpMethod.GET);
      expect(routes.length).toBe(2);
    });

    it('should get routes by status', () => {
      const routes = router.getRoutesByStatus(RouteStatus.ACTIVE);
      expect(routes.length).toBe(2);
    });

    it('should get routes by priority', () => {
      const routes = router.getRoutesByPriority(RoutePriority.HIGH);
      expect(routes.length).toBe(1);
    });
  });
});
