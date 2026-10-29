/**
 * Strategy tests for Event layer
 */

import { EventDefaultStrategy } from '../strategies/DefaultStrategy';
import { EventFastStrategy } from '../strategies/FastStrategy';
import { EventReliableStrategy } from '../strategies/ReliableStrategy';
import { EventCachedStrategy } from '../strategies/CachedStrategy';
import { EventBatchStrategy } from '../strategies/BatchStrategy';
import { EventBroadcastStrategy } from '../strategies/BroadcastEventStrategy';
import { EventFilteredStrategy } from '../strategies/FilteredEventStrategy';
import { EventPrioritizedStrategy } from '../strategies/PrioritizedEventStrategy';
import { EventDeadLetterStrategy } from '../strategies/DeadLetterEventStrategy';
import { EventStrategyFactory } from '../factories/EventStrategyFactory';
import { LoggingEventStrategy } from '../strategies/LoggingEventStrategy';
import { MetricsEventStrategy } from '../strategies/MetricsEventStrategy';

describe('Event Strategies', () => {
  const baseStrategies = [
    { name: 'default', cls: EventDefaultStrategy },
    { name: 'fast', cls: EventFastStrategy },
    { name: 'reliable', cls: EventReliableStrategy },
    { name: 'cached', cls: EventCachedStrategy },
    { name: 'batch', cls: EventBatchStrategy, config: { maxBatchSize: 2, maxBatchWaitMs: 100 } },
  ];

  baseStrategies.forEach((s) => {
    describe(s.name + ' strategy', () => {
      it('should have correct name', () => {
        const strategy = s.config ? new s.cls(s.config) : new s.cls();
        expect(strategy.name).toBe(s.name);
      });

      it('should have positive priority', () => {
        const strategy = s.config ? new s.cls(s.config) : new s.cls();
        expect(strategy.priority).toBeGreaterThanOrEqual(0);
      });

      it('should execute successfully', async () => {
        const strategy = s.config ? new s.cls(s.config) : new s.cls();
        const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
        const result = await strategy.execute(context);
        expect(result.success).toBe(true);
      });

      it('should track execution count', async () => {
        const strategy = s.config ? new s.cls(s.config) : new s.cls();
        const context1 = { operation: 'publish', eventName: 'test1', timestamp: Date.now() };
        const context2 = { operation: 'publish', eventName: 'test2', timestamp: Date.now() };
        const context3 = { operation: 'publish', eventName: 'test3', timestamp: Date.now() };
        await strategy.execute(context1);
        await strategy.execute(context2);
        await strategy.execute(context3);
        expect(strategy.getExecutionCount()).toBe(3);
      });

      it('should handle canHandle correctly', () => {
        const strategy = s.config ? new s.cls(s.config) : new s.cls();
        expect(strategy.canHandle({ operation: 'publish', eventName: 'test', timestamp: Date.now() })).toBe(true);
        expect(strategy.canHandle({ operation: '', eventName: 'test', timestamp: Date.now() })).toBe(false);
        expect(strategy.canHandle({ operation: 'publish', eventName: '', timestamp: Date.now() })).toBe(false);
        expect(strategy.canHandle(null)).toBe(false);
        expect(strategy.canHandle(undefined)).toBe(false);
      });
    });
  });

  describe('EventBroadcastStrategy', () => {
    it('should have correct name and priority', () => {
      const strategy = new EventBroadcastStrategy();
      expect(strategy.name).toBe('broadcast');
      expect(strategy.priority).toBe(8);
    });

    it('should register and unregister subscribers', () => {
      const strategy = new EventBroadcastStrategy();
      const handler = async () => ({ success: true, data: undefined });
      strategy.registerSubscriber('sub1', handler);
      expect(strategy.getSubscribers()).toContain('sub1');
      strategy.unregisterSubscriber('sub1');
      expect(strategy.getSubscribers()).not.toContain('sub1');
    });

    it('should execute with no subscribers', async () => {
      const strategy = new EventBroadcastStrategy();
      const context = { operation: 'broadcast', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
      expect(result.metadata?.subscriberCount).toBe(0);
    });

    it('should execute in parallel mode', async () => {
      const strategy = new EventBroadcastStrategy({ mode: 'parallel', maxConcurrency: 5 });
      const results: string[] = [];
      strategy.registerSubscriber('sub1', async () => { results.push('sub1'); return { success: true, data: undefined }; });
      strategy.registerSubscriber('sub2', async () => { results.push('sub2'); return { success: true, data: undefined }; });
      const context = { operation: 'broadcast', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
      expect(results.length).toBe(2);
    });

    it('should execute in sequential mode', async () => {
      const strategy = new EventBroadcastStrategy({ mode: 'sequential' });
      const results: string[] = [];
      strategy.registerSubscriber('sub1', async () => { results.push('sub1'); return { success: true, data: undefined }; });
      strategy.registerSubscriber('sub2', async () => { results.push('sub2'); return { success: true, data: undefined }; });
      const context = { operation: 'broadcast', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
      expect(results).toEqual(['sub1', 'sub2']);
    });

    it('should track delivery metrics', async () => {
      const strategy = new EventBroadcastStrategy();
      strategy.registerSubscriber('sub1', async () => ({ success: true, data: undefined }));
      const context = { operation: 'broadcast', eventName: 'test', timestamp: Date.now() };
      await strategy.execute(context);
      expect(strategy.getTotalDeliveries()).toBe(1);
      expect(strategy.getDeliverySuccessRate()).toBe(1);
    });
  });

  describe('EventFilteredStrategy', () => {
    it('should have correct name and priority', () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventFilteredStrategy(base);
      expect(strategy.name).toBe('filtered');
      expect(strategy.priority).toBe(12);
    });

    it('should allow events by default', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventFilteredStrategy(base);
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
    });

    it('should deny events matching deny rule', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventFilteredStrategy(base);
      strategy.addRule({
        id: 'deny-test',
        name: 'Deny test events',
        predicate: (ctx) => ctx.eventName === 'test',
        action: 'deny',
        priority: 10,
        enabled: true,
      });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILTER_DENIED');
    });

    it('should allow events matching allow rule', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventFilteredStrategy(base, { defaultAction: 'deny' });
      strategy.addRule({
        id: 'allow-test',
        name: 'Allow test events',
        predicate: (ctx) => ctx.eventName === 'test',
        action: 'allow',
        priority: 10,
        enabled: true,
      });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
    });

    it('should transform context with transform rule', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventFilteredStrategy(base);
      strategy.addRule({
        id: 'transform-test',
        name: 'Transform test events',
        predicate: (ctx) => ctx.eventName === 'test',
        action: 'transform',
        priority: 10,
        enabled: true,
        transform: async (ctx) => ({ ...ctx, eventName: 'transformed' }),
      });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
    });

    it('should track rule match counts', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventFilteredStrategy(base);
      strategy.addRule({
        id: 'rule1',
        name: 'Rule 1',
        predicate: (ctx) => ctx.eventName === 'test',
        action: 'allow',
        priority: 10,
        enabled: true,
      });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      await strategy.execute(context);
      await strategy.execute(context);
      expect(strategy.getRuleMatchCount('rule1')).toBe(2);
    });

    it('should enable/disable rules', () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventFilteredStrategy(base);
      strategy.addRule({
        id: 'rule1',
        name: 'Rule 1',
        predicate: () => true,
        action: 'deny',
        priority: 10,
        enabled: true,
      });
      expect(strategy.setRuleEnabled('rule1', false)).toBe(true);
      expect(strategy.getRules().find(r => r.id === 'rule1')?.enabled).toBe(false);
    });
  });

  describe('EventPrioritizedStrategy', () => {
    it('should have correct name and priority', () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventPrioritizedStrategy(base);
      expect(strategy.name).toBe('prioritized');
      expect(strategy.priority).toBe(15);
    });

    it('should start and stop workers', () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventPrioritizedStrategy(base, { workerCount: 2 });
      expect(strategy.isProcessing()).toBe(false);
      strategy.start();
      expect(strategy.isProcessing()).toBe(true);
      strategy.stop();
      expect(strategy.isProcessing()).toBe(false);
    });

    it('should execute non-publish operations directly', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventPrioritizedStrategy(base);
      const context = { operation: 'subscribe', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
      expect(result.metadata?.queued).toBe(false);
    });

    it('should queue publish operations', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventPrioritizedStrategy(base, { workerCount: 1 });
      strategy.start();
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      const promise = strategy.execute(context);
      // Give worker time to process
      await new Promise(r => setTimeout(r, 50));
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.metadata?.queued).toBe(true);
      strategy.stop();
    });

    it('should track queue sizes', () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventPrioritizedStrategy(base);
      const sizes = strategy.getQueueSizes();
      expect(sizes.get(0)).toBe(0); // LOW
      expect(sizes.get(50)).toBe(0); // NORMAL
      expect(sizes.get(100)).toBe(0); // HIGH
      expect(sizes.get(200)).toBe(0); // CRITICAL
    });
  });

  describe('EventDeadLetterStrategy', () => {
    it('should have correct name and priority', () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventDeadLetterStrategy(base);
      expect(strategy.name).toBe('dead-letter');
      expect(strategy.priority).toBe(1);
    });

    it('should add failed events to dead letter queue', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventDeadLetterStrategy(base, { autoRetry: false });
      // Create a strategy that always fails
      const failingStrategy = {
        name: 'failing',
        priority: 1,
        canHandle: () => true,
        execute: async () => ({ success: false, error: { code: 'TIMEOUT', message: 'Timeout' } })
      };
      const dlStrategy = new EventDeadLetterStrategy(failingStrategy as any, { autoRetry: false });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      await dlStrategy.execute(context);
      expect(dlStrategy.getQueueSize()).toBe(1);
      expect(dlStrategy.getDeadLetterCount()).toBe(1);
    });

    it('should replay dead letter entries', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventDeadLetterStrategy(base, { autoRetry: false });
      const failingStrategy = {
        name: 'failing',
        priority: 1,
        canHandle: () => true,
        execute: async () => ({ success: false, error: { code: 'TIMEOUT', message: 'Timeout' } })
      };
      const dlStrategy = new EventDeadLetterStrategy(failingStrategy as any, { autoRetry: false });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      await dlStrategy.execute(context);
      const entries = dlStrategy.getAllEntries();
      expect(entries.length).toBe(1);
      // Replay with a working strategy
      const workingStrategy = new EventDefaultStrategy();
      const replayStrategy = new EventDeadLetterStrategy(workingStrategy, { autoRetry: false });
      // Manually add entry
      replayStrategy['_deadLetterQueue'].set(entries[0].id, entries[0]);
      const result = await replayStrategy.replay(entries[0].id);
      expect(result.success).toBe(true);
      expect(replayStrategy.getReplayCount()).toBe(1);
    });

    it('should discard entries', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventDeadLetterStrategy(base, { autoRetry: false });
      const failingStrategy = {
        name: 'failing',
        priority: 1,
        canHandle: () => true,
        execute: async () => ({ success: false, error: { code: 'TIMEOUT', message: 'Timeout' } })
      };
      const dlStrategy = new EventDeadLetterStrategy(failingStrategy as any, { autoRetry: false });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      await dlStrategy.execute(context);
      const entries = dlStrategy.getAllEntries();
      expect(dlStrategy.discard(entries[0].id)).toBe(true);
      expect(dlStrategy.getQueueSize()).toBe(0);
      expect(dlStrategy.getDiscardCount()).toBe(1);
    });

    it('should filter retryable errors', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new EventDeadLetterStrategy(base, {
        autoRetry: false,
        retryPolicy: { retryableErrorCodes: ['TIMEOUT'], nonRetryableErrorCodes: ['VALIDATION_ERROR'] }
      });
      const failingStrategy = {
        name: 'failing',
        priority: 1,
        canHandle: () => true,
        execute: async () => ({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid' } })
      };
      const dlStrategy = new EventDeadLetterStrategy(failingStrategy as any, {
        autoRetry: false,
        retryPolicy: { retryableErrorCodes: ['TIMEOUT'], nonRetryableErrorCodes: ['VALIDATION_ERROR'] }
      });
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      await dlStrategy.execute(context);
      // Non-retryable error should not be added to dead letter queue
      expect(dlStrategy.getQueueSize()).toBe(0);
    });
  });

  describe('LoggingEventStrategy', () => {
    it('should wrap strategy and log', async () => {
      const base = new EventDefaultStrategy();
      const logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      };
      const strategy = new LoggingEventStrategy(base, logger as any, 'INFO');
      expect(strategy.name).toBe('logging-default');
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
    });
  });

  describe('MetricsEventStrategy', () => {
    it('should wrap strategy and collect metrics', async () => {
      const base = new EventDefaultStrategy();
      const strategy = new MetricsEventStrategy(base);
      expect(strategy.name).toBe('metrics-default');
      const context = { operation: 'publish', eventName: 'test', timestamp: Date.now() };
      const result = await strategy.execute(context);
      expect(result.success).toBe(true);
      const metrics = strategy.getMetrics();
      expect(metrics).not.toBeNull();
      expect(metrics?.totalExecutions).toBe(1);
    });
  });

  describe('EventStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new EventStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all base strategies', () => {
      const factory = new EventStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new EventStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
      expect(available).toContain('reliable');
      expect(available).toContain('cached');
      expect(available).toContain('batch');
    });

    it('should throw for unknown strategy', () => {
      const factory = new EventStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new EventStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });

    it('should register custom strategy', () => {
      const factory = new EventStrategyFactory();
      factory.registerStrategy('custom', () => ({
        name: 'custom',
        priority: 100,
        execute: async () => ({ success: true, data: undefined }),
        canHandle: () => true,
      }));
      const strategy = factory.create('custom');
      expect(strategy.name).toBe('custom');
      expect(strategy.priority).toBe(100);
    });
  });
});