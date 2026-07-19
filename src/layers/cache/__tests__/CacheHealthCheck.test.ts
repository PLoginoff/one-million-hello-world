/**
 * Cache Health Check Unit Tests
 */

import { CacheHealthCheck } from '../health/CacheHealthCheck';
import { BasicStatisticsCollector } from '../statistics/collectors/BasicStatisticsCollector';

describe('CacheHealthCheck', () => {
  let collector: BasicStatisticsCollector;
  let healthCheck: CacheHealthCheck;

  beforeEach(() => {
    collector = new BasicStatisticsCollector();
    healthCheck = new CacheHealthCheck(collector);
  });

  it('should return healthy when hit rate is high', () => {
    for (let i = 0; i < 8; i++) collector.recordHit();
    for (let i = 0; i < 2; i++) collector.recordMiss();

    const result = healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBe(3);
  });

  it('should return unhealthy when no requests (0% hit rate)', () => {
    const result = healthCheck.check();
    expect(result.status).toBe('unhealthy');
    const requestCheck = result.checks.find((c) => c.name === 'request-count');
    expect(requestCheck!.status).toBe('degraded');
  });

  it('should flag degraded when hit rate is 50-80%', () => {
    for (let i = 0; i < 5; i++) collector.recordHit();
    for (let i = 0; i < 5; i++) collector.recordMiss();

    const result = healthCheck.check();
    const hitRateCheck = result.checks.find((c) => c.name === 'hit-rate');
    expect(hitRateCheck!.status).toBe('degraded');
  });

  it('should flag unhealthy when hit rate is below 50%', () => {
    for (let i = 0; i < 2; i++) collector.recordHit();
    for (let i = 0; i < 8; i++) collector.recordMiss();

    const result = healthCheck.check();
    const hitRateCheck = result.checks.find((c) => c.name === 'hit-rate');
    expect(hitRateCheck!.status).toBe('unhealthy');
  });

  it('should flag degraded when eviction rate is 5-15%', () => {
    for (let i = 0; i < 90; i++) collector.recordHit();
    for (let i = 0; i < 10; i++) collector.recordMiss();
    for (let i = 0; i < 6; i++) collector.recordEviction();

    const result = healthCheck.check();
    const evictionCheck = result.checks.find((c) => c.name === 'eviction-rate');
    expect(evictionCheck!.status).toBe('degraded');
  });
});
