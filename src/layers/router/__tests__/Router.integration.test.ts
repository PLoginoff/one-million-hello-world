/**
 * Router Integration Tests
 * 
 * Integration tests for Router implementation.
 * Tests full workflows, configuration chaining, statistics tracking, and advanced features.
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
  RouterConfig,
} from '../types/router-types';

describe('Router Integration', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe('Full Workflow', () => {
    it('should complete full workflow with registration, matching, and statistics', () => {
      router.setConfig({
        caseSensitive: false,
        strictRouting: false,
        allowWildcards: true,
        enableCaching: false,
        cacheTTL: 60000,
        enableMetrics: true,
        enableLogging: false,
        maxRoutes: 1000,
        defaultPriority: RoutePriority.MEDIUM,
        defaultCache: 'NONE' as any,
      });

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        priority: RoutePriority.HIGH,
        status: RouteStatus.ACTIVE,
        tags: ['api', 'users'],
      });

      router.registerRoute({
        method: HttpMethod.POST,
        path: '/users',
        handler: 'createUser',
        priority: RoutePriority.MEDIUM,
        status: RouteStatus.ACTIVE,
        tags: ['api', 'users'],
      });

      const request: HttpRequest = {
        line: { method: HttpMethod.GET, path: '/users', version: 'HTTP/1.1' },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /users HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const match = router.match(request);
      const stats = router.getStatistics();

      expect(match.matched).toBe(true);
      expect(stats.totalRoutes).toBe(2);
      expect(stats.activeRoutes).toBe(2);
    });
  });

  describe('Configuration Chaining', () => {
    it('should support configuration updates during operation', () => {
      router.setConfig({ caseSensitive: true } as RouterConfig);
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/Users',
        handler: 'getUsers',
      });

      router.setConfig({ caseSensitive: false } as RouterConfig);

      const request: HttpRequest = {
        line: { method: HttpMethod.GET, path: '/users', version: 'HTTP/1.1' },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /users HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const match = router.match(request);
      expect(match.matched).toBe(true);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track statistics across multiple operations', () => {
      for (let i = 0; i < 5; i++) {
        router.registerRoute({
          method: HttpMethod.GET,
          path: `/route${i}`,
          handler: `handler${i}`,
          status: RouteStatus.ACTIVE,
        });
      }

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/disabled',
        handler: 'disabledHandler',
        status: RouteStatus.DISABLED,
      });

      const stats = router.getStatistics();
      expect(stats.totalRoutes).toBe(6);
      expect(stats.activeRoutes).toBe(5);
      expect(stats.disabledRoutes).toBe(1);
    });
  });

  describe('Route Group Integration', () => {
    it('should integrate route groups with middleware and priority', () => {
      const group: RouteGroup = {
        name: 'api',
        prefix: '/api',
        middleware: ['auth', 'logging'],
        priority: RoutePriority.HIGH,
        cache: 'MEMORY' as any,
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
      expect(routes[0].middleware).toContain('logging');
    });
  });

  describe('Filter Integration', () => {
    it('should integrate multiple filter criteria', () => {
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
        status: RouteStatus.ACTIVE,
        tags: ['api', 'users'],
        group: 'api',
        version: 'v1',
      });

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/posts',
        handler: 'getPosts',
        priority: RoutePriority.LOW,
        status: RouteStatus.DISABLED,
        tags: ['api', 'posts'],
        group: 'api',
        version: 'v1',
      });

      const filter: RouteFilter = {
        method: HttpMethod.GET,
        status: RouteStatus.ACTIVE,
        tags: ['users'],
        group: 'api',
      };

      const filtered = router.getFilteredRoutes(filter);
      expect(filtered.length).toBe(1);
    });
  });

  describe('Middleware Integration', () => {
    it('should integrate middleware with routes', () => {
      const middleware: MiddlewareDefinition = {
        name: 'auth',
        order: 'BEFORE' as any,
        handler: 'authHandler',
        enabled: true,
        routes: ['/users'],
      };

      router.registerMiddleware(middleware);

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        middleware: ['auth'],
      });

      const middlewareList = router.getMiddleware();
      const routes = router.getRoutes();

      expect(middlewareList.length).toBe(1);
      expect(routes.length).toBe(1);
      expect(routes[0].middleware).toContain('auth');
    });
  });

  describe('Validation Integration', () => {
    it('should integrate validation with route management', () => {
      const validRoute: Route = {
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      };

      const invalidRoute: Route = {
        method: HttpMethod.GET,
        path: '',
        handler: '',
      };

      router.registerRoute(validRoute);
      router.registerRoute(invalidRoute);

      const results = router.validateAllRoutes();
      expect(results.length).toBe(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
    });
  });

  describe('Metadata Integration', () => {
    it('should integrate metadata with route operations', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        tags: ['api'],
        description: 'Get all users',
        version: 'v1',
      });

      const metadata = router.getRouteMetadata(HttpMethod.GET, '/users');
      expect(metadata?.tags).toContain('api');
      expect(metadata?.description).toBe('Get all users');
      expect(metadata?.version).toBe('v1');

      router.updateRoute(HttpMethod.GET, '/users', { description: 'Updated description' });

      const updatedMetadata = router.getRouteMetadata(HttpMethod.GET, '/users');
      expect(updatedMetadata?.description).toBe('Updated description');
    });
  });

  describe('Cache Integration', () => {
    it('should integrate cache with matching', () => {
      router.setConfig({
        enableCaching: true,
        cacheTTL: 60000,
      } as RouterConfig);

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
      });

      const request: HttpRequest = {
        line: { method: HttpMethod.GET, path: '/users', version: 'HTTP/1.1' },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /users HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      router.match(request);
      expect(router.getCacheSize()).toBe(1);

      router.match(request);
      expect(router.getCacheSize()).toBe(1);

      router.clearCache();
      expect(router.getCacheSize()).toBe(0);
    });
  });

  describe('Route Status Management Integration', () => {
    it('should integrate status management with matching', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/users',
        handler: 'getUsers',
        status: RouteStatus.ACTIVE,
      });

      const request: HttpRequest = {
        line: { method: HttpMethod.GET, path: '/users', version: 'HTTP/1.1' },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /users HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      let match = router.match(request);
      expect(match.matched).toBe(true);

      router.disableRoute(HttpMethod.GET, '/users');

      match = router.match(request);
      expect(match.matched).toBe(false);

      router.enableRoute(HttpMethod.GET, '/users');

      match = router.match(request);
      expect(match.matched).toBe(true);
    });
  });

  describe('Complex Workflow Integration', () => {
    it('should handle complex workflow with all features', () => {
      router.setConfig({
        caseSensitive: false,
        strictRouting: false,
        allowWildcards: true,
        enableCaching: true,
        cacheTTL: 60000,
        enableMetrics: true,
        enableLogging: true,
        maxRoutes: 1000,
        defaultPriority: RoutePriority.MEDIUM,
        defaultCache: 'NONE' as any,
      });

      const group: RouteGroup = {
        name: 'api',
        prefix: '/api',
        middleware: ['auth'],
        routes: [
          {
            method: HttpMethod.GET,
            path: '/api/users',
            handler: 'getUsers',
            priority: RoutePriority.HIGH,
            tags: ['api', 'users'],
          },
        ],
      };

      router.registerRouteGroup(group);

      const middleware: MiddlewareDefinition = {
        name: 'auth',
        order: 'BEFORE' as any,
        handler: 'authHandler',
        enabled: true,
      };

      router.registerMiddleware(middleware);

      const request: HttpRequest = {
        line: { method: HttpMethod.GET, path: '/api/users', version: 'HTTP/1.1' },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /api/users HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const match = router.match(request);
      const stats = router.getStatistics();
      const metadata = router.getRouteMetadata(HttpMethod.GET, '/api/users');

      expect(match.matched).toBe(true);
      expect(stats.totalRoutes).toBe(1);
      expect(stats.activeRoutes).toBe(1);
      expect(metadata?.group).toBe('api');
      expect(router.getCacheSize()).toBe(1);
    });
  });
});
