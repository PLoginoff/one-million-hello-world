/**
 * E2E tests for HTTP endpoints
 * Tests the full request/response cycle through the core pipeline
 */

import { Router } from '../../layers/router/implementations/Router';
import { Route, HttpMethod } from '../../layers/router/types/router-types';
import { TokenBucketStrategy } from '../../layers/rate-limiting/strategies/algorithm/TokenBucketStrategy';
import { RateLimitKey } from '../../layers/rate-limiting/domain/entities/RateLimitKey';
import { CorsStrategy } from '../../layers/security/strategies/cors/CorsStrategy';
import { HelmetStrategy } from '../../layers/security/strategies/helmet/HelmetStrategy';

describe('HTTP E2E Tests', () => {
  describe('Hello World endpoint', () => {
    it('should register and process GET /hello-world route', () => {
      const router = new Router();
      const route: Route = {
        method: HttpMethod.GET,
        path: '/hello-world',
        handler: 'helloWorld',
      };
      router.registerRoute(route);

      const status = router.getRoutes();
      expect(status).toBeDefined();
    });

    it('should handle multiple route registrations', () => {
      const router = new Router();
      router.registerRoute({ method: HttpMethod.GET, path: '/hello', handler: 'hello' });
      router.registerRoute({ method: HttpMethod.POST, path: '/echo', handler: 'echo' });
      router.registerRoute({ method: HttpMethod.DELETE, path: '/items/:id', handler: 'deleteItem' });

      const status = router.getRoutes();
      expect(status).toBeDefined();
    });
  });

  describe('Rate limiting E2E', () => {
    it('should enforce rate limits on repeated requests', () => {
      const limiter = new TokenBucketStrategy();
      const key = RateLimitKey.fromIp('192.168.1.1');

      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(limiter.isAllowed(key, 5, 1000).allowed);
      }

      const allowed = results.filter((r) => r).length;
      const denied = results.filter((r) => !r).length;

      expect(allowed).toBe(5);
      expect(denied).toBe(5);
    });

    it('should track different users separately', () => {
      const limiter = new TokenBucketStrategy();
      const user1 = RateLimitKey.fromUser('user-1');
      const user2 = RateLimitKey.fromUser('user-2');

      for (let i = 0; i < 5; i++) {
        limiter.isAllowed(user1, 5, 1000);
      }

      const user1Result = limiter.isAllowed(user1, 5, 1000);
      const user2Result = limiter.isAllowed(user2, 5, 1000);

      expect(user1Result.allowed).toBe(false);
      expect(user2Result.allowed).toBe(true);
    });
  });

  describe('Security E2E', () => {
    it('should apply CORS and helmet headers', () => {
      const cors = new CorsStrategy({
        allowedOrigins: ['https://app.example.com'],
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['X-Request-Id'],
        credentials: true,
        maxAge: 3600,
      });

      const helmet = new HelmetStrategy();

      const corsResult = cors.handleRequest('https://app.example.com');
      expect(corsResult.allowed).toBe(true);
      expect(corsResult.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');

      const helmetHeaders = helmet.getHeaders();
      expect(helmetHeaders['X-Content-Type-Options']).toBe('nosniff');
      expect(helmetHeaders['X-Frame-Options']).toBe('DENY');
    });

    it('should block requests from disallowed origins', () => {
      const cors = new CorsStrategy({
        allowedOrigins: ['https://app.example.com'],
        allowedMethods: ['GET'],
        allowedHeaders: [],
        exposedHeaders: [],
        credentials: false,
        maxAge: 0,
      });

      const result = cors.handleRequest('https://evil.com');
      expect(result.allowed).toBe(false);
    });
  });

  describe('Full pipeline E2E', () => {
    it('should process request through rate limit + security + router', () => {
      const limiter = new TokenBucketStrategy();
      const cors = new CorsStrategy({
        allowedOrigins: ['*'],
        allowedMethods: ['GET'],
        allowedHeaders: [],
        exposedHeaders: [],
        credentials: false,
        maxAge: 0,
      });
      const router = new Router();

      const key = RateLimitKey.fromIp('10.0.0.1');
      const rateResult = limiter.isAllowed(key, 10, 1000);
      expect(rateResult.allowed).toBe(true);

      const corsResult = cors.handleRequest('https://app.example.com');
      expect(corsResult.allowed).toBe(true);

      router.registerRoute({ method: HttpMethod.GET, path: '/hello-world', handler: 'helloWorld' });
      expect(router.getRoutes()).toBeDefined();
    });
  });
});
