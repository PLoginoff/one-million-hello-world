/**
 * Service Strategies Unit Tests
 */

import { DefaultServiceStrategy } from '../strategies/strategy/DefaultServiceStrategy';
import { CachingServiceStrategy } from '../strategies/strategy/CachingServiceStrategy';
import { RetryServiceStrategy } from '../strategies/strategy/RetryServiceStrategy';
import { SynchronousServiceStrategy } from '../strategies/strategy/SynchronousServiceStrategy';
import { ServiceEntity } from '../domain/entities/ServiceEntity';

describe('DefaultServiceStrategy', () => {
  let strategy: DefaultServiceStrategy;
  let service: ServiceEntity;

  beforeEach(() => {
    strategy = new DefaultServiceStrategy();
    service = ServiceEntity.createBasic('svc-1', 'TestService', '1.0.0');
  });

  it('should return name DEFAULT', () => {
    expect(strategy.getName()).toBe('DEFAULT');
  });

  it('should execute enabled service', async () => {
    const result = await strategy.execute(service, 'test-input');
    expect(result).toBe('test-input');
  });

  it('should throw for disabled service', async () => {
    const disabled = service.disable();
    await expect(strategy.execute(disabled, 'input')).rejects.toThrow("Service 'svc-1' is disabled");
  });
});

describe('CachingServiceStrategy', () => {
  let inner: SynchronousServiceStrategy;
  let strategy: CachingServiceStrategy;
  let service: ServiceEntity;

  beforeEach(() => {
    inner = new SynchronousServiceStrategy();
    strategy = new CachingServiceStrategy(inner, 60000);
    service = ServiceEntity.createBasic('svc-1', 'TestService', '1.0.0');
  });

  it('should wrap inner strategy name', () => {
    expect(strategy.getName()).toBe('CACHING(SYNCHRONOUS)');
  });

  it('should cache results on repeated calls', async () => {
    const input = { key: 'value' };
    const result1 = await strategy.execute(service, input);
    const result2 = await strategy.execute(service, input);

    expect(result1).toEqual(input);
    expect(result2).toEqual(input);
    expect(strategy.getCacheHits()).toBe(1);
    expect(strategy.getCacheMisses()).toBe(1);
  });

  it('should track cache size', async () => {
    await strategy.execute(service, 'input1');
    await strategy.execute(service, 'input2');
    expect(strategy.getCacheSize()).toBe(2);
  });

  it('should clear cache', async () => {
    await strategy.execute(service, 'input');
    strategy.clearCache();
    expect(strategy.getCacheSize()).toBe(0);
    expect(strategy.getCacheHits()).toBe(0);
    expect(strategy.getCacheMisses()).toBe(0);
  });

  it('should evict expired entries', async () => {
    const shortTtl = new CachingServiceStrategy(inner, 1);
    await shortTtl.execute(service, 'input');
    await new Promise((resolve) => setTimeout(resolve, 10));
    const evicted = shortTtl.evictExpired();
    expect(evicted).toBe(1);
  });
});

describe('RetryServiceStrategy', () => {
  let service: ServiceEntity;

  beforeEach(() => {
    service = ServiceEntity.createBasic('svc-1', 'TestService', '1.0.0');
  });

  it('should wrap inner strategy name', () => {
    const inner = new SynchronousServiceStrategy();
    const strategy = new RetryServiceStrategy(inner);
    expect(strategy.getName()).toBe('RETRY(SYNCHRONOUS)');
  });

  it('should succeed on first attempt', async () => {
    const inner = new SynchronousServiceStrategy();
    const strategy = new RetryServiceStrategy(inner, { maxRetries: 3, baseDelayMs: 1 });

    const result = await strategy.execute(service, 'input');
    expect(result).toBe('input');

    const metrics = strategy.getMetrics();
    expect(metrics.totalAttempts).toBe(1);
    expect(metrics.totalRetries).toBe(0);
  });

  it('should retry on failure and eventually succeed', async () => {
    let callCount = 0;
    const failingThenSucceeding = {
      getName: () => 'FLAKY',
      execute: async () => {
        callCount++;
        if (callCount < 3) throw new Error('fail');
        return 'success';
      },
    } as unknown as SynchronousServiceStrategy;

    const strategy = new RetryServiceStrategy(failingThenSucceeding, { maxRetries: 3, baseDelayMs: 1 });
    const result = await strategy.execute(service, 'input');

    expect(result).toBe('success');
    const metrics = strategy.getMetrics();
    expect(metrics.totalAttempts).toBe(3);
    expect(metrics.totalRetries).toBe(2);
    expect(metrics.successfulAfterRetry).toBe(1);
  });

  it('should exhaust retries and throw', async () => {
    const alwaysFailing = {
      getName: () => 'FAILING',
      execute: async () => {
        throw new Error('always fails');
      },
    } as unknown as SynchronousServiceStrategy;

    const strategy = new RetryServiceStrategy(alwaysFailing, { maxRetries: 2, baseDelayMs: 1 });

    await expect(strategy.execute(service, 'input')).rejects.toThrow('always fails');

    const metrics = strategy.getMetrics();
    expect(metrics.totalAttempts).toBe(3);
    expect(metrics.exhaustedRetries).toBe(1);
  });

  it('should reset metrics', async () => {
    const inner = new SynchronousServiceStrategy();
    const strategy = new RetryServiceStrategy(inner, { maxRetries: 2, baseDelayMs: 1 });

    await strategy.execute(service, 'input');
    strategy.resetMetrics();

    const metrics = strategy.getMetrics();
    expect(metrics.totalAttempts).toBe(0);
  });
});
