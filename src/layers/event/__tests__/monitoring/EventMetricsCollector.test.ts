/**
 * EventMetricsCollector Unit Tests
 * 
 * Comprehensive tests for EventMetricsCollector monitoring implementation.
 * Tests cover metrics recording, time-series data, statistics, and edge cases.
 */

import { EventMetricsCollector } from '../../monitoring/EventMetricsCollector';
import { Event } from '../../domain/entities/Event';

describe('EventMetricsCollector', () => {
  let collector: EventMetricsCollector;

  beforeEach(() => {
    collector = new EventMetricsCollector();
  });

  describe('constructor', () => {
    it('should create with default max time series points', () => {
      expect(collector).toBeDefined();
    });

    it('should create with custom max time series points', () => {
      const customCollector = new EventMetricsCollector(500);
      expect(customCollector).toBeDefined();
    });
  });

  describe('recordEventPublished', () => {
    it('should record published event', () => {
      const event = Event.create('test.event', {});
      collector.recordEventPublished(event.type.value);

      const metrics = collector.getMetrics();
      expect(metrics.totalEventsPublished).toBe(1);
    });

    it('should increment published count', () => {
      collector.recordEventPublished('event1');
      collector.recordEventPublished('event1');
      collector.recordEventPublished('event2');

      const metrics = collector.getMetrics();
      expect(metrics.totalEventsPublished).toBe(3);
    });

    it('should track events by type', () => {
      collector.recordEventPublished('event1');
      collector.recordEventPublished('event1');
      collector.recordEventPublished('event2');

      const metrics = collector.getMetrics();
      expect(metrics.eventsByType['event1']).toBe(2);
      expect(metrics.eventsByType['event2']).toBe(1);
    });

    it('should record time-series data', () => {
      collector.recordEventPublished('test.event');

      const timeSeries = collector.getTimeSeries('events_published');
      expect(timeSeries).toHaveLength(1);
      expect(timeSeries[0].value).toBe(1);
    });
  });

  describe('recordEventHandled', () => {
    it('should record handled event', () => {
      const event = Event.create('test.event', {});
      collector.recordEventHandled(event.type.value, 100);

      const metrics = collector.getMetrics();
      expect(metrics.totalEventsHandled).toBe(1);
    });

    it('should increment handled count', () => {
      collector.recordEventHandled('event1', 100);
      collector.recordEventHandled('event1', 100);
      collector.recordEventHandled('event2', 100);

      const metrics = collector.getMetrics();
      expect(metrics.totalEventsHandled).toBe(3);
    });

    it('should update average processing time', () => {
      collector.recordEventHandled('test.event', 100);
      collector.recordEventHandled('test.event', 200);

      const metrics = collector.getMetrics();
      expect(metrics.avgProcessingTime).toBe(150);
    });

    it('should update processing time statistics', () => {
      const times = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      times.forEach(time => collector.recordEventHandled('test.event', time));

      const metrics = collector.getMetrics();
      expect(metrics.avgProcessingTime).toBe(55);
    });

    it('should calculate p95 processing time', () => {
      const times = Array.from({ length: 100 }, (_, i) => i);
      times.forEach(time => collector.recordEventHandled('test.event', time));

      const metrics = collector.getMetrics();
      expect(metrics.p95ProcessingTime).toBeGreaterThan(0);
    });

    it('should calculate p99 processing time', () => {
      const times = Array.from({ length: 100 }, (_, i) => i);
      times.forEach(time => collector.recordEventHandled('test.event', time));

      const metrics = collector.getMetrics();
      expect(metrics.p99ProcessingTime).toBeGreaterThan(0);
    });

    it('should record processing time time-series', () => {
      collector.recordEventHandled('test.event', 100);

      const timeSeries = collector.getTimeSeries('processing_time');
      expect(timeSeries).toHaveLength(1);
      expect(timeSeries[0].value).toBe(100);
    });
  });

  describe('recordError', () => {
    it('should record error', () => {
      const event = Event.create('test.event', {});
      const error = new Error('Test error');
      collector.recordError(event.type.value, error);

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(1);
    });

    it('should increment error count', () => {
      const error = new Error('Test error');
      collector.recordError('event1', error);
      collector.recordError('event1', error);
      collector.recordError('event2', error);

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(3);
    });

    it('should track errors by type', () => {
      const error = new Error('Test error');
      collector.recordError('event1', error);
      collector.recordError('event1', error);
      collector.recordError('event2', error);

      const metrics = collector.getMetrics();
      expect(metrics.errorsByType['event1']).toBe(2);
      expect(metrics.errorsByType['event2']).toBe(1);
    });

    it('should record error time-series', () => {
      const error = new Error('Test error');
      collector.recordError('test.event', error);

      const timeSeries = collector.getTimeSeries('errors');
      expect(timeSeries).toHaveLength(1);
      expect(timeSeries[0].value).toBe(1);
    });
  });

  describe('recordQueueSize', () => {
    it('should record queue size', () => {
      collector.recordQueueSize(10);

      const metrics = collector.getMetrics();
      expect(metrics.currentQueueSize).toBe(10);
    });

    it('should update queue size', () => {
      collector.recordQueueSize(5);
      collector.recordQueueSize(10);
      collector.recordQueueSize(15);

      const metrics = collector.getMetrics();
      expect(metrics.currentQueueSize).toBe(15);
    });

    it('should record queue size time-series', () => {
      collector.recordQueueSize(10);

      const timeSeries = collector.getTimeSeries('queue_size');
      expect(timeSeries).toHaveLength(1);
      expect(timeSeries[0].value).toBe(10);
    });
  });

  describe('recordSubscriptionCount', () => {
    it('should record subscription count', () => {
      collector.recordSubscriptionCount(5);

      const metrics = collector.getMetrics();
      expect(metrics.activeSubscriptions).toBe(5);
    });

    it('should update subscription count', () => {
      collector.recordSubscriptionCount(3);
      collector.recordSubscriptionCount(5);
      collector.recordSubscriptionCount(7);

      const metrics = collector.getMetrics();
      expect(metrics.activeSubscriptions).toBe(7);
    });

    it('should record subscription count time-series', () => {
      collector.recordSubscriptionCount(5);

      const timeSeries = collector.getTimeSeries('subscription_count');
      expect(timeSeries).toHaveLength(1);
      expect(timeSeries[0].value).toBe(5);
    });
  });

  describe('getMetrics', () => {
    it('should return all metrics', () => {
      collector.recordEventPublished('test.event');
      collector.recordEventHandled('test.event', 100);
      collector.recordQueueSize(5);
      collector.recordSubscriptionCount(3);

      const metrics = collector.getMetrics();

      expect(metrics.totalEventsPublished).toBe(1);
      expect(metrics.totalEventsHandled).toBe(1);
      expect(metrics.currentQueueSize).toBe(5);
      expect(metrics.activeSubscriptions).toBe(3);
    });

    it('should return copy of metrics', () => {
      collector.recordEventPublished('test.event');
      const metrics = collector.getMetrics();
      metrics.totalEventsPublished = 999;

      const freshMetrics = collector.getMetrics();
      expect(freshMetrics.totalEventsPublished).toBe(1);
    });

    it('should return zero values when no data recorded', () => {
      const metrics = collector.getMetrics();

      expect(metrics.totalEventsPublished).toBe(0);
      expect(metrics.totalEventsHandled).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.avgProcessingTime).toBe(0);
      expect(metrics.p95ProcessingTime).toBe(0);
      expect(metrics.p99ProcessingTime).toBe(0);
      expect(metrics.currentQueueSize).toBe(0);
      expect(metrics.activeSubscriptions).toBe(0);
    });
  });

  describe('getTimeSeries', () => {
    it('should return time-series for metric', () => {
      collector.recordEventPublished('test.event');
      collector.recordEventPublished('test.event');
      collector.recordEventPublished('test.event');

      const timeSeries = collector.getTimeSeries('events_published');
      expect(timeSeries).toHaveLength(3);
    });

    it('should return empty array for non-existent metric', () => {
      const timeSeries = collector.getTimeSeries('non-existent');
      expect(timeSeries).toEqual([]);
    });

    it('should filter by duration', () => {
      collector.recordEventPublished('test.event');
      await new Promise(resolve => setTimeout(resolve, 10));
      collector.recordEventPublished('test.event');

      const timeSeries = collector.getTimeSeries('events_published', 5);
      expect(timeSeries.length).toBeGreaterThan(0);
    });

    it('should respect max time series points', () => {
      const customCollector = new EventMetricsCollector(5);
      for (let i = 0; i < 10; i++) {
        customCollector.recordEventPublished('test.event');
      }

      const timeSeries = customCollector.getTimeSeries('events_published');
      expect(timeSeries.length).toBe(5);
    });

    it('should return time-series with timestamps', () => {
      collector.recordEventPublished('test.event');

      const timeSeries = collector.getTimeSeries('events_published');
      expect(timeSeries[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.recordEventPublished('test.event');
      collector.recordEventHandled('test.event', 100);
      collector.recordError('test.event', new Error('Test'));
      collector.recordQueueSize(5);
      collector.recordSubscriptionCount(3);

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalEventsPublished).toBe(0);
      expect(metrics.totalEventsHandled).toBe(0);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.avgProcessingTime).toBe(0);
      expect(metrics.currentQueueSize).toBe(0);
      expect(metrics.activeSubscriptions).toBe(0);
    });

    it('should clear time-series data', () => {
      collector.recordEventPublished('test.event');
      collector.reset();

      const timeSeries = collector.getTimeSeries('events_published');
      expect(timeSeries).toEqual([]);
    });

    it('should clear events by type', () => {
      collector.recordEventPublished('event1');
      collector.recordEventPublished('event2');
      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.eventsByType).toEqual({});
    });

    it('should clear errors by type', () => {
      const error = new Error('Test');
      collector.recordError('event1', error);
      collector.recordError('event2', error);
      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.errorsByType).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle recording many events', () => {
      for (let i = 0; i < 10000; i++) {
        collector.recordEventPublished(`event${i}`);
      }

      const metrics = collector.getMetrics();
      expect(metrics.totalEventsPublished).toBe(10000);
    });

    it('should handle very fast processing times', () => {
      collector.recordEventHandled('test.event', 0.1);
      collector.recordEventHandled('test.event', 0.5);

      const metrics = collector.getMetrics();
      expect(metrics.avgProcessingTime).toBeGreaterThan(0);
    });

    it('should handle very slow processing times', () => {
      collector.recordEventHandled('test.event', 10000);
      collector.recordEventHandled('test.event', 20000);

      const metrics = collector.getMetrics();
      expect(metrics.avgProcessingTime).toBe(15000);
    });

    it('should handle zero processing time', () => {
      collector.recordEventHandled('test.event', 0);

      const metrics = collector.getMetrics();
      expect(metrics.avgProcessingTime).toBe(0);
    });

    it('should handle negative processing time (edge case)', () => {
      collector.recordEventHandled('test.event', -1);

      const metrics = collector.getMetrics();
      expect(metrics.avgProcessingTime).toBeLessThanOrEqual(0);
    });

    it('should handle concurrent metric recording', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              collector.recordEventPublished(`event${i}`);
              resolve(null);
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);

      const metrics = collector.getMetrics();
      expect(metrics.totalEventsPublished).toBe(100);
    });

    it('should handle many different event types', () => {
      for (let i = 0; i < 1000; i++) {
        collector.recordEventPublished(`event${i}`);
      }

      const metrics = collector.getMetrics();
      expect(Object.keys(metrics.eventsByType).length).toBe(1000);
    });

    it('should maintain processing time limit', () => {
      for (let i = 0; i < 2000; i++) {
        collector.recordEventHandled('test.event', i);
      }

      const metrics = collector.getMetrics();
      expect(metrics.avgProcessingTime).toBeGreaterThan(0);
    });
  });
});
