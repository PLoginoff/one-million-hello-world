/**
 * Router Unit Tests
 * 
 * Tests for Router implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Router } from '../implementations/Router';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { HttpMethod as RouterHttpMethod } from '../types/router-types';
import { HttpMethod as ParserHttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = router.getConfig();

      expect(config).toBeDefined();
      expect(config.caseSensitive).toBe(true);
      expect(config.strictRouting).toBe(false);
      expect(config.allowWildcards).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        caseSensitive: false,
        strictRouting: true,
        allowWildcards: false,
      };

      router.setConfig(newConfig);
      const config = router.getConfig();

      expect(config.caseSensitive).toBe(false);
      expect(config.strictRouting).toBe(true);
      expect(config.allowWildcards).toBe(false);
    });
  });

  describe('registerRoute', () => {
    it('should register a new route', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      };

      router.registerRoute(route);
      const routes = router.getRoutes();

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual(route);
    });
  });

  describe('match', () => {
    it('should match exact route', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      };

      router.registerRoute(route);
      const request = createMockRequest('/test');
      const result = router.match(request);

      expect(result.matched).toBe(true);
      expect(result.route).toEqual(route);
    });

    it('should not match when method differs', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      };

      router.registerRoute(route);
      const request = createMockRequest('/test', ParserHttpMethod.POST);
      const result = router.match(request);

      expect(result.matched).toBe(false);
    });

    it('should not match when path differs', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      };

      router.registerRoute(route);
      const request = createMockRequest('/other');
      const result = router.match(request);

      expect(result.matched).toBe(false);
    });

    it('should extract parameters from path', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/users/:id',
        handler: 'userHandler',
      };

      router.registerRoute(route);
      const request = createMockRequest('/users/123');
      const result = router.match(request);

      expect(result.matched).toBe(true);
      expect(result.parameters).toEqual({ id: '123' });
    });

    it('should match wildcard routes', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/api/*',
        handler: 'apiHandler',
      };

      router.registerRoute(route);
      const request = createMockRequest('/api/users');
      const result = router.match(request);

      expect(result.matched).toBe(true);
      expect(result.wildcard).toBe(true);
    });

    it('should match case-insensitively when configured', () => {
      router.setConfig({
        caseSensitive: false,
        strictRouting: false,
        allowWildcards: true,
      });

      const route = {
        method: RouterHttpMethod.GET,
        path: '/Test',
        handler: 'testHandler',
      };

      router.registerRoute(route);
      const request = createMockRequest('/test');
      const result = router.match(request);

      expect(result.matched).toBe(true);
    });
  });

  describe('removeRoute', () => {
    it('should remove registered route', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      };

      router.registerRoute(route);
      router.removeRoute(RouterHttpMethod.GET, '/test');
      const routes = router.getRoutes();

      expect(routes).toHaveLength(0);
    });
  });

  describe('clearRoutes', () => {
    it('should clear all routes', () => {
      router.registerRoute({
        method: RouterHttpMethod.GET,
        path: '/test1',
        handler: 'handler1',
      });

      router.registerRoute({
        method: RouterHttpMethod.POST,
        path: '/test2',
        handler: 'handler2',
      });

      router.clearRoutes();
      const routes = router.getRoutes();

      expect(routes).toHaveLength(0);
    });
  });

  describe('getRoutes', () => {
    it('should return copy of routes', () => {
      const route = {
        method: RouterHttpMethod.GET,
        path: '/test',
        handler: 'testHandler',
      };

      router.registerRoute(route);
      const routes = router.getRoutes();

      routes.push({ method: RouterHttpMethod.POST, path: '/new', handler: 'newHandler' });

      expect(router.getRoutes()).toHaveLength(1);
    });
  });
});

function createMockRequest(path: string, method: ParserHttpMethod = ParserHttpMethod.GET): HttpRequest {
  return {
    line: {
      method: method as any,
      path,
      version: HttpVersion.HTTP_1_1,
    },
    headers: new Map([
      ['host', 'localhost'],
      ['user-agent', 'test-agent'],
    ]),
    body: Buffer.from(''),
    raw: Buffer.from(`${method} ${path} HTTP/1.1\r\nHost: localhost\r\n\r\n`),
  };
}
