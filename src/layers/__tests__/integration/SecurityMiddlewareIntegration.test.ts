/**
 * Integration test: Security → Middleware
 * Verifies that security checks integrate with middleware pipeline
 */

import { CorsStrategy } from '../../security/strategies/cors/CorsStrategy';
import { HelmetStrategy } from '../../security/strategies/helmet/HelmetStrategy';
import { LoggingMiddlewareStrategy } from '../../middleware/strategies/strategy/LoggingMiddlewareStrategy';
import { TracingMiddlewareStrategy } from '../../middleware/strategies/strategy/TracingMiddlewareStrategy';
import { MiddlewareContextEntity } from '../../middleware/domain/entities/MiddlewareContextEntity';
import { MockLogger } from '../../../test/mocks/MockLogger';

describe('Security → Middleware Integration', () => {
  it('should apply CORS headers then pass through middleware', async () => {
    const cors = new CorsStrategy({
      allowedOrigins: ['https://example.com'],
      allowedMethods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
      exposedHeaders: [],
      credentials: true,
      maxAge: 3600,
    });
    const logger = new MockLogger();
    const logging = new LoggingMiddlewareStrategy(logger, 'info');
    const tracing = new TracingMiddlewareStrategy('test-service');

    const corsResult = cors.handleRequest('https://example.com');
    expect(corsResult.allowed).toBe(true);

    let context = MiddlewareContextEntity.create({}, {});
    context = await tracing.execute(context);
    context = await logging.execute(context);

    expect(context.getMetadata('traceId')).toBeDefined();
    expect(context.getMetadata('serviceName')).toBe('test-service');
    expect(logger.hasMessage('middleware:request')).toBe(true);
  });

  it('should block disallowed origin before middleware', async () => {
    const cors = new CorsStrategy({
      allowedOrigins: ['https://example.com'],
      allowedMethods: ['GET'],
      allowedHeaders: [],
      exposedHeaders: [],
      credentials: false,
      maxAge: 0,
    });

    const corsResult = cors.handleRequest('https://evil.com');
    expect(corsResult.allowed).toBe(false);
    expect(corsResult.headers).toEqual({});
  });

  it('should apply helmet headers alongside middleware tracing', async () => {
    const helmet = new HelmetStrategy({ contentSecurityPolicy: "default-src 'self'" });
    const tracing = new TracingMiddlewareStrategy('secure-service');

    const headers = helmet.getHeaders();
    expect(headers['Content-Security-Policy']).toBe("default-src 'self'");
    expect(headers['X-Frame-Options']).toBe('DENY');

    let context = MiddlewareContextEntity.create({}, {});
    context = await tracing.execute(context);
    expect(context.getMetadata('serviceName')).toBe('secure-service');
  });
});
