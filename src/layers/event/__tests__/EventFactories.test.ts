/**
 * Factory tests for Event layer
 */

import { EventStrategyFactory } from '../factories/EventStrategyFactory';
import { EventFactory } from '../factories/EventFactory';
import { EventDefaultStrategy } from '../strategies/DefaultStrategy';
import { EventFastStrategy } from '../strategies/FastStrategy';
import { EventReliableStrategy } from '../strategies/ReliableStrategy';
import { InMemoryEventBusAdapter } from '../adapters/InMemoryEventBusAdapter';
import { IEventBus } from '../interfaces/IEventBus';

describe('EventStrategyFactory', () => {
  let factory: EventStrategyFactory;

  beforeEach(() => {
    factory = new EventStrategyFactory();
  });

  it('should create default strategy', () => {
    const strategy = factory.create('default');
    expect(strategy.name).toBe('default');
    expect(strategy.priority).toBe(10);
  });

  it('should create fast strategy', () => {
    const strategy = factory.create('fast');
    expect(strategy.name).toBe('fast');
    expect(strategy.priority).toBe(20);
  });

  it('should create reliable strategy', () => {
    const strategy = factory.create('reliable');
    expect(strategy.name).toBe('reliable');
    expect(strategy.priority).toBe(5);
  });

  it('should create cached strategy', () => {
    const strategy = factory.create('cached');
    expect(strategy.name).toBe('cached');
    expect(strategy.priority).toBe(15);
  });

  it('should create batch strategy', () => {
    const strategy = factory.create('batch');
    expect(strategy.name).toBe('batch');
    expect(strategy.priority).toBe(3);
  });

  it('should create default via createDefault', () => {
    const strategy = factory.createDefault();
    expect(strategy.name).toBe('default');
  });

  it('should list available strategies', () => {
    const available = factory.getAvailableStrategies();
    expect(available).toContain('default');
    expect(available).toContain('fast');
    expect(available).toContain('reliable');
    expect(available).toContain('cached');
    expect(available).toContain('batch');
  });

  it('should throw for unknown strategy', () => {
    expect(() => factory.create('unknown')).toThrow('Unknown event strategy');
  });

  it('should create all strategies', () => {
    const all = factory.createAll();
    expect(all.length).toBe(5);
    const names = all.map(s => s.name).sort();
    expect(names).toEqual(['batch', 'cached', 'default', 'fast', 'reliable']);
  });

  it('should sort by priority', () => {
    const sorted = factory.createByPriority();
    expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    // Fast (20) should be first, batch (3) should be last
    expect(sorted[0].name).toBe('fast');
    expect(sorted[sorted.length - 1].name).toBe('batch');
  });

  it('should register custom strategy', () => {
    factory.registerStrategy('custom', () => ({
      name: 'custom',
      priority: 100,
      execute: async () => ({ success: true, data: undefined }),
      canHandle: () => true,
    }));
    const strategy = factory.create('custom');
    expect(strategy.name).toBe('custom');
    expect(strategy.priority).toBe(100);
    expect(factory.getAvailableStrategies()).toContain('custom');
  });
});

describe('EventFactory', () => {
  it('should create development event bus', () => {
    const bus = EventFactory.createDevelopment();
    expect(bus).toBeDefined();
    expect(bus.getConfig().logLevel).toBe('debug');
  });

  it('should create testing event bus', () => {
    const bus = EventFactory.createTesting();
    expect(bus).toBeDefined();
    expect(bus.getConfig().logLevel).toBe('error');
  });

  it('should create low-latency event bus', () => {
    const bus = EventFactory.createLowLatency();
    expect(bus).toBeDefined();
  });

  // These tests require external dependencies (Redis, Kafka) and are skipped
  it.skip('should create staging event bus', () => {
    const bus = EventFactory.createStaging();
    expect(bus).toBeDefined();
  });

  it.skip('should create production event bus', () => {
    const bus = EventFactory.createProduction();
    expect(bus).toBeDefined();
  });

  it.skip('should create high-throughput event bus', () => {
    const bus = EventFactory.createHighThroughput();
    expect(bus).toBeDefined();
  });

  it.skip('should create reliable event bus', () => {
    const bus = EventFactory.createReliable();
    expect(bus).toBeDefined();
  });

  it('should create with custom adapter', () => {
    const bus = EventFactory.createWithAdapter('memory', { enableAsync: true });
    expect(bus).toBeDefined();
  });

  it('should create with custom config', () => {
    const bus = EventFactory.createCustom({
      adapter: { type: 'memory', config: { enableAsync: false } },
      strategy: 'fast',
      enableLogging: true,
      enableMetrics: true,
    });
    expect(bus).toBeDefined();
  });

  it('should get strategy factory', () => {
    const strategyFactory = EventFactory.getStrategyFactory();
    expect(strategyFactory).toBeInstanceOf(EventStrategyFactory);
  });

  it('should register custom strategy globally', () => {
    EventFactory.registerStrategy('global-custom', () => ({
      name: 'global-custom',
      priority: 50,
      execute: async () => ({ success: true, data: undefined }),
      canHandle: () => true,
    }));
    const strategyFactory = EventFactory.getStrategyFactory();
    const strategy = strategyFactory.create('global-custom');
    expect(strategy.name).toBe('global-custom');
  });

  it('should create event bus with profile', () => {
    const bus = EventFactory.create('development');
    expect(bus).toBeDefined();
  });

  it('should create event bus with unknown profile (falls back)', () => {
    const bus = EventFactory.create('unknown' as any);
    expect(bus).toBeDefined();
  });
});

describe('EventFactory integration', () => {
  it('should create functional event bus', () => {
    const bus = EventFactory.createDevelopment();
    let received = '';
    bus.subscribe('test', (data: string) => { received = data; });
    bus.publish('test', 'hello');
    expect(received).toBe('hello');
  });

  it('should create event bus with async config', () => {
    const bus = EventFactory.createDevelopment({ eventBusConfig: { enableAsync: true } });
    expect(bus.getConfig().enableAsync).toBe(true);
  });

  it('should create event bus with persistence config', () => {
    const bus = EventFactory.createDevelopment({ eventBusConfig: { enablePersistence: true } });
    expect(bus.getConfig().enablePersistence).toBe(true);
  });
});