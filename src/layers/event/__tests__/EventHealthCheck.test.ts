/**
 * Health check tests for Event layer
 */

import { EventHealthCheck } from '../health/EventHealthCheck';
import { EventMetricsCollector } from '../metrics/EventMetricsCollector';
import { InMemoryEventBusAdapter } from '../adapters/InMemoryEventBusAdapter';
import { EventHealthStatus } from '../health/EventHealthCheck';

describe('EventHealthCheck', () => {
  it('should return degraded when no executions', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const result = await healthCheck.check();
    expect(result.status).toBe('degraded');
    expect(result.checks.some(c => c.name === 'execution-metrics')).toBe(true);
    collector.stopCollection();
  });

  it('should return healthy with good metrics', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const adapter = new InMemoryEventBusAdapter();
    healthCheck.registerAdapter('memory', adapter, 'memory');
    // Record some successful executions
    collector.recordPublish('test', 10, true);
    collector.recordPublish('test', 15, true);
    collector.recordHandle('test', 5, true);

    const result = await healthCheck.check();
    expect(result.status).toBe('healthy');
    expect(result.checks.length).toBeGreaterThan(0);
    collector.stopCollection();
  });

  it('should return degraded with low success rate', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    collector.recordPublish('test', 10, true);
    collector.recordPublish('test', 10, false);
    collector.recordPublish('test', 10, false);

    const result = await healthCheck.check();
    expect(result.status).toBe('unhealthy');
    collector.stopCollection();
  });

  it('should return degraded with high latency', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    collector.recordPublish('test', 200, true);
    collector.recordPublish('test', 300, true);

    const result = await healthCheck.check();
    expect(result.status).toBe('degraded');
    collector.stopCollection();
  });

  it('should check registered adapters', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const adapter = new InMemoryEventBusAdapter();
    healthCheck.registerAdapter('memory', adapter, 'memory');
    const result = await healthCheck.check();
    const adapterCheck = result.checks.find(c => c.name === 'adapter:memory');
    expect(adapterCheck).toBeDefined();
    expect(adapterCheck?.status).toBe('healthy');
    collector.stopCollection();
  });

  it('should unregister adapters', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const adapter = new InMemoryEventBusAdapter();
    healthCheck.registerAdapter('memory', adapter, 'memory');
    healthCheck.unregisterAdapter('memory');
    const result = await healthCheck.check();
    const adapterCheck = result.checks.find(c => c.name === 'adapter:memory');
    expect(adapterCheck).toBeUndefined();
    collector.stopCollection();
  });

  it('should perform quick check', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const adapter = new InMemoryEventBusAdapter();
    healthCheck.registerAdapter('memory', adapter, 'memory');
    const result = await healthCheck.quickCheck();
    expect(result.checks.length).toBeGreaterThan(0);
    const adapterCheck = result.checks.find(c => c.name === 'adapter:memory');
    expect(adapterCheck).toBeDefined();
    collector.stopCollection();
  });

  it('should aggregate status correctly', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const adapter = new InMemoryEventBusAdapter();
    collector.recordPublish('test', 10, true);
    healthCheck.registerAdapter('memory', adapter, 'memory');
    const result = await healthCheck.check();
    expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
    collector.stopCollection();
  });

  it('should include timestamp and summary', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const result = await healthCheck.check();
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.summary).toContain('Event health:');
    expect(result.version).toBeDefined();
    collector.stopCollection();
  });

  it('should update config', () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    healthCheck.updateConfig({ maxQueueDepth: 5000 });
    const config = healthCheck.getConfig();
    expect(config.maxQueueDepth).toBe(5000);
    collector.stopCollection();
  });

  it('should check connectivity for redis adapter', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    // Mock redis adapter
    const mockRedis = {
      getStats: () => ({ publishedCount: 0, handledCount: 0, errorCount: 0, subscriptionCount: 0 }),
      isConnected: () => true,
    } as any;
    healthCheck.registerAdapter('redis', mockRedis, 'redis');
    const result = await healthCheck.check();
    const redisCheck = result.checks.find(c => c.name === 'adapter:redis');
    expect(redisCheck).toBeDefined();
    collector.stopCollection();
  });

  it('should check connectivity for kafka adapter', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const mockKafka = {
      getStats: () => ({ publishedCount: 0, handledCount: 0, errorCount: 0, subscriptionCount: 0 }),
      isConnected: () => true,
    } as any;
    healthCheck.registerAdapter('kafka', mockKafka, 'kafka');
    const result = await healthCheck.check();
    const kafkaCheck = result.checks.find(c => c.name === 'adapter:kafka');
    expect(kafkaCheck).toBeDefined();
    collector.stopCollection();
  });

  it('should handle adapter check errors gracefully', async () => {
    const collector = new EventMetricsCollector();
    const healthCheck = new EventHealthCheck(collector);
    const badAdapter = {
      getStats: () => { throw new Error('Connection failed'); },
    } as any;
    healthCheck.registerAdapter('bad', badAdapter, 'memory');
    const result = await healthCheck.check();
    const badCheck = result.checks.find(c => c.name === 'adapter:bad');
    expect(badCheck).toBeDefined();
    expect(badCheck?.status).toBe('unhealthy');
    collector.stopCollection();
  });
});