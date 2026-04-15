/**
 * Router Edge Cases Tests
 * 
 * Edge case tests for Router implementation.
 * Tests error handling, empty/malformed inputs, boundary values, and unusual scenarios.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Router } from '../implementations/Router';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import {
  HttpMethod,
  Route,
  RouteGroup,
  RouteFilter,
  RoutePriority,
  RouteStatus,
  RouterConfig,
} from '../types/router-types';

describe('Router Edge Cases', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe('Empty and Null Inputs', () => {
    it('should handle empty path', () => {
      const route: Route = {
        method: HttpMethod.GET,
        path: '',
        handler: 'testHandler',
      };

      router.registerRoute(route);

      const routes = router.getRoutes();
      expect(routes.length).toBe(1);
    });

    it('should handle empty handler', () => {
      const route: Route = {
        method: HttpMethod.GET,
        path: '/test',
        handler: '',
      };

      router.registerRoute(route);

      const routes = router.getRoutes();
      expect(routes.length).toBe(1);
    });

    it('should handle route with no parameters', () => {
      const route: Route = {
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
        parameters: undefined,
      };

      router.registerRoute(route);

      const retrievedRoute = router.getRoute(HttpMethod.GET, '/test');
      expect(retrievedRoute?.parameters).toBeUndefined();
    });
  });

  describe('Boundary Values', () => {
    it('should handle very long path', () => {
      const longPath = '/a'.repeat(1000);
      const route: Route = {
        method: HttpMethod.GET,
        path: longPath,
        handler: 'testHandler',
      };

      router.registerRoute(route);

      const retrievedRoute = router.getRoute(HttpMethod.GET, longPath);
      expect(retrievedRoute?.path).toBe(longPath);
    });

    it('should handle maximum routes limit', () => {
      router.setConfig({ maxRoutes: 2 } as RouterConfig);

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test1',
        handler: 'handler1',
      });

      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test2',
        handler: 'handler2',
      });

      expect(() => {
        router.registerRoute({
          method: HttpMethod.GET,
          path: '/test3',
          handler: 'handler3',
        });
      }).toThrow();
    });
  });

  describe('Non-existent Resources', () => {
    it('should handle getting non-existent route', () => {
      const route = router.getRoute(HttpMethod.GET, '/nonexistent');
      expect(route).toBeUndefined();
    });

    it('should handle removing non-existent route', () => {
      router.removeRoute(HttpMethod.GET, '/nonexistent');
      const routes = router.getRoutes();
      expect(routes.length).toBe(0);
    });

    it('should handle updating non-existent route', () => {
      router.updateRoute(HttpMethod.GET, '/nonexistent', { priority: RoutePriority.HIGH });
      const routes = router.getRoutes();
      expect(routes.length).toBe(0);
    });

    it('should handle enabling non-existent route', () => {
      router.enableRoute(HttpMethod.GET, '/nonexistent');
      const routes = router.getRoutes();
      expect(routes.length).toBe(0);
    });

    it('should handle disabling non-existent route', () => {
      router.disableRoute(HttpMethod.GET, '/nonexistent');
      const routes = router.getRoutes();
      expect(routes.length).toBe(0);
    });

    it('should handle removing non-existent route group', () => {
      router.removeRouteGroup('nonexistent');
      const groups = router.getRouteGroups();
      expect(groups.length).toBe(0);
    });

    it('should handle removing non-existent middleware', () => {
      router.removeMiddleware('nonexistent');
      const middleware = router.getMiddleware();
      expect(middleware.length).toBe(0);
    });

    it('should handle enabling non-existent middleware', () => {
      router.enableMiddleware('nonexistent');
      const middleware = router.getMiddleware();
      expect(middleware.length).toBe(0);
    });

    it('should handle disabling non-existent middleware', () => {
      router.disableMiddleware('nonexistent');
      const middleware = router.getMiddleware();
      expect(middleware.length).toBe(0);
    });
  });

  describe('Filter Edge Cases', () => {
    it('should handle empty filter', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      });

      const filter: RouteFilter = {};
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(1);
    });

    it('should handle filter with no matches', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      });

      const filter: RouteFilter = { method: HttpMethod.POST };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(0);
    });

    it('should handle filter limit of zero', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      });

      const filter: RouteFilter = { limit: 0 };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(0);
    });

    it('should handle filter limit larger than available routes', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      });

      const filter: RouteFilter = { limit: 100 };
      const filtered = router.getFilteredRoutes(filter);

      expect(filtered.length).toBe(1);
    });
  });

  describe('Route Group Edge Cases', () => {
    it('should handle empty route group', () => {
      const group: RouteGroup = {
        name: 'empty',
        prefix: '/empty',
        routes: [],
      };

      router.registerRouteGroup(group);

      const routes = router.getRoutes();
      expect(routes.length).toBe(0);
    });

    it('should handle route group with empty prefix', () => {
      const group: RouteGroup = {
        name: 'root',
        prefix: '',
        routes: [
          {
            method: HttpMethod.GET,
            path: '/test',
            handler: 'testHandler',
          },
        ],
      };

      router.registerRouteGroup(group);

      const routes = router.getRoutes();
      expect(routes.length).toBe(1);
    });

    it('should handle duplicate route group names', () => {
      const group1: RouteGroup = {
        name: 'duplicate',
        prefix: '/api1',
        routes: [
          {
            method: HttpMethod.GET,
            path: '/test',
            handler: 'handler1',
          },
        ],
      };

      const group2: RouteGroup = {
        name: 'duplicate',
        prefix: '/api2',
        routes: [
          {
            method: HttpMethod.GET,
            path: '/test',
            handler: 'handler2',
          },
        ],
      };

      router.registerRouteGroup(group1);
      router.registerRouteGroup(group2);

      const groups = router.getRouteGroups();
      expect(groups.length).toBe(2);
    });
  });

  describe('Statistics Edge Cases', () => {
    it('should handle statistics with no routes', () => {
      const stats = router.getStatistics();
      expect(stats.totalRoutes).toBe(0);
      expect(stats.activeRoutes).toBe(0);
      expect(stats.disabledRoutes).toBe(0);
    });

    it('should handle statistics reset with no routes', () => {
      router.resetStatistics();
      const stats = router.getStatistics();
      expect(stats.totalRoutes).toBe(0);
    });
  });

  describe('Cache Edge Cases', () => {
    it('should handle clearing empty cache', () => {
      router.clearCache();
      expect(router.getCacheSize()).toBe(0);
    });

    it('should handle getting cache size with caching disabled', () => {
      router.setConfig({ enableCaching: false } as RouterConfig);
      expect(router.getCacheSize()).toBe(0);
    });
  });

  describe('Route Queries Edge Cases', () => {
    it('should handle getting routes by non-existent tag', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
        tags: ['api'],
      });

      const routes = router.getRoutesByTag('nonexistent');
      expect(routes.length).toBe(0);
    });

    it('should handle getting routes by non-existent group', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      });

      const routes = router.getRoutesByGroup('nonexistent');
      expect(routes.length).toBe(0);
    });

    it('should handle getting routes by method with no routes', () => {
      const routes = router.getRoutesByMethod(HttpMethod.GET);
      expect(routes.length).toBe(0);
    });

    it('should handle getting routes by status with no matching routes', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
        status: RouteStatus.ACTIVE,
      });

      const routes = router.getRoutesByStatus(RouteStatus.DISABLED);
      expect(routes.length).toBe(0);
    });

    it('should handle getting routes by priority with no matching routes', () => {
      router.registerRoute({
        method: HttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
        priority: RoutePriority.LOW,
      });

      const routes = router.getRoutesByPriority(RoutePriority.HIGH);
      expect(routes.length).toBe(0);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle partial configuration update', () => {
      router.setConfig({ caseSensitive: false } as RouterConfig);
      const config = router.getConfig();
      expect(config.caseSensitive).toBe(false);
    });

    it('should handle configuration with all values', () => {
      router.setConfig({
        caseSensitive: false,
        strictRouting: true,
        allowWildcards: false,
        enableCaching: true,
        cacheTTL: 120000,
        enableMetrics: true,
        enableLogging: true,
        maxRoutes: 500,
        defaultPriority: RoutePriority.HIGH,
        defaultCache: 'MEMORY' as any,
      });

      const config = router.getConfig();
      expect(config.caseSensitive).toBe(false);
      expect(config.strictRouting).toBe(true);
      expect(config.allowWildcards).toBe(false);
    });
  });

  describe('Metadata Edge Cases', () => {
    it('should handle getting metadata for non-existent route', () => {
      const metadata = router.getRouteMetadata(HttpMethod.GET, '/nonexistent');
      expect(metadata).toBeUndefined();
    });

    it('should handle getting all metadata with no routes', () => {
      const metadata = router.getAllRouteMetadata();
      expect(metadata.length).toBe(0);
    });
  });

  describe('Clear Operations Edge Cases', () => {
    it('should handle clearing empty routes', () => {
      router.clearRoutes();
      const routes = router.getRoutes();
      expect(routes.length).toBe(0);
    });
  });
});
