/**
 * Middleware Strategies Unit Tests
 */

import { LoggingMiddlewareStrategy, IMiddlewareLogger } from '../strategies/strategy/LoggingMiddlewareStrategy';
import { TracingMiddlewareStrategy } from '../strategies/strategy/TracingMiddlewareStrategy';
import { MetricsMiddlewareStrategy } from '../strategies/strategy/MetricsMiddlewareStrategy';
import { RateLimitMiddlewareStrategy } from '../strategies/strategy/RateLimitMiddlewareStrategy';
import { MiddlewareContextEntity } from '../domain/entities/MiddlewareContextEntity';

describe('LoggingMiddlewareStrategy', () => {
  let logger: IMiddlewareLogger;
  let logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }>;
  let strategy: LoggingMiddlewareStrategy;

  beforeEach(() => {
    logs = [];
    logger = {
      log: (level, message, meta?) => logs.push({ level, message, meta }),
    };
    strategy = new LoggingMiddlewareStrategy(logger, 'info');
  });

  it('should return name LOGGING', () => {
    expect(strategy.getName()).toBe('LOGGING');
  });

  it('should log request and response', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    await strategy.execute(context);

    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('middleware:request');
    expect(logs[1].message).toBe('middleware:response');
  });
});

describe('TracingMiddlewareStrategy', () => {
  let strategy: TracingMiddlewareStrategy;

  beforeEach(() => {
    strategy = new TracingMiddlewareStrategy('test-service');
  });

  it('should return name TRACING', () => {
    expect(strategy.getName()).toBe('TRACING');
  });

  it('should add tracing metadata', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    const result = await strategy.execute(context);

    expect(result.getMetadata('traceId')).toBeDefined();
    expect(result.getMetadata('spanId')).toBeDefined();
    expect(result.getMetadata('serviceName')).toBe('test-service');
    expect(result.getMetadata('traceTimestamp')).toBeDefined();
  });
});

describe('MetricsMiddlewareStrategy', () => {
  let strategy: MetricsMiddlewareStrategy;

  beforeEach(() => {
    strategy = new MetricsMiddlewareStrategy();
  });

  it('should return name METRICS', () => {
    expect(strategy.getName()).toBe('METRICS');
  });

  it('should track request count', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    await strategy.execute(context);
    await strategy.execute(context);

    const metrics = strategy.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.averageDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should add metricsStartTime to context', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    const result = await strategy.execute(context);
    expect(result.getMetadata('metricsStartTime')).toBeDefined();
  });

  it('should reset metrics', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    await strategy.execute(context);
    strategy.reset();

    expect(strategy.getMetrics().totalRequests).toBe(0);
  });
});

describe('RateLimitMiddlewareStrategy', () => {
  let strategy: RateLimitMiddlewareStrategy;

  beforeEach(() => {
    strategy = new RateLimitMiddlewareStrategy({ maxRequests: 3, windowMs: 1000 });
  });

  it('should return name RATE_LIMIT', () => {
    expect(strategy.getName()).toBe('RATE_LIMIT');
  });

  it('should allow requests within limit', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    await strategy.execute(context);
    await strategy.execute(context);
    await strategy.execute(context);

    expect(strategy.getAllowedCount()).toBe(3);
    expect(strategy.getRejectedCount()).toBe(0);
  });

  it('should reject requests exceeding limit', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    for (let i = 0; i < 5; i++) {
      await strategy.execute(context);
    }

    expect(strategy.getAllowedCount()).toBe(3);
    expect(strategy.getRejectedCount()).toBe(2);
  });

  it('should set rateLimited metadata when rejected', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    for (let i = 0; i < 4; i++) {
      await strategy.execute(context);
    }

    // The 4th request should be rate limited
    // Since context is immutable, we need to check the last result
    const result = await strategy.execute(context);
    expect(result.getMetadata('rateLimited')).toBe(true);
  });

  it('should set remaining count metadata', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    const result = await strategy.execute(context);

    expect(result.getMetadata('rateLimitRemaining')).toBe(2);
    expect(result.getMetadata('rateLimitLimit')).toBe(3);
  });

  it('should reset counters', async () => {
    const context = MiddlewareContextEntity.create({}, {});
    await strategy.execute(context);
    strategy.reset();

    expect(strategy.getAllowedCount()).toBe(0);
    expect(strategy.getRejectedCount()).toBe(0);
  });
});
