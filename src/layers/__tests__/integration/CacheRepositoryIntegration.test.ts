/**
 * Integration test: Cache → Repository
 */

import { InMemoryAdapter } from '../../repository/adapters/InMemoryAdapter';
import { BasicStatisticsCollector } from '../../cache/statistics/collectors/BasicStatisticsCollector';
import { CacheHealthCheck } from '../../cache/health/CacheHealthCheck';
import { DomainEntity } from '../../domain/types/domain-types';

interface TestEntity extends DomainEntity {
  name: string;
}

describe('Cache → Repository Integration', () => {
  it('should track cache stats with repository save/find', async () => {
    const repo = new InMemoryAdapter<TestEntity>();
    await repo.connect();

    const cacheStats = new BasicStatisticsCollector();

    const entity: TestEntity = { id: '1', name: 'test', createdAt: new Date(), updatedAt: new Date() };
    await repo.save(entity);
    cacheStats.recordHit();
    cacheStats.updateSize(1);

    const found = await repo.findById('1');
    expect(found.success).toBe(true);

    const healthCheck = new CacheHealthCheck(cacheStats);
    const health = await healthCheck.check();
    expect(health.status).toBe('healthy');

    await repo.disconnect();
  });

  it('should record cache miss when repository returns empty', async () => {
    const repo = new InMemoryAdapter<TestEntity>();
    await repo.connect();

    const cacheStats = new BasicStatisticsCollector();

    const result = await repo.findById('nonexistent');
    if (!result.success) {
      cacheStats.recordMiss();
    }

    const health = await new CacheHealthCheck(cacheStats).check();
    const hitRateCheck = health.checks.find((c) => c.name === 'hit-rate');
    expect(hitRateCheck!.status).toBe('unhealthy');

    await repo.disconnect();
  });

  it('should track cache health through multiple repository operations', async () => {
    const repo = new InMemoryAdapter<TestEntity>();
    await repo.connect();

    const cacheStats = new BasicStatisticsCollector();

    for (let i = 0; i < 5; i++) {
      const entity: TestEntity = {
        id: String(i),
        name: `entity-${i}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await repo.save(entity);
      cacheStats.recordHit();
    }

    cacheStats.updateSize(5);

    const health = await new CacheHealthCheck(cacheStats).check();
    expect(health.status).toBe('healthy');

    await repo.disconnect();
  });
});
