/**
 * Extended domain tests for Analytics
 */

import { AnalyticsExecution } from '../entities/AnalyticsExecution';
import { AnalyticsConfigState as AnalyticsConfigEntity } from '../entities/AnalyticsConfigState';
import { AnalyticsMetricsSnapshot } from '../entities/AnalyticsMetricsSnapshot';
import { AnalyticsThreshold } from '../value-objects/AnalyticsThreshold';
import { AnalyticsTimeWindow } from '../value-objects/AnalyticsTimeWindow';
import { AnalyticsPriority } from '../value-objects/AnalyticsPriority';
import { AnalyticsExecuted } from '../events/AnalyticsExecuted';
import { AnalyticsFailed } from '../events/AnalyticsFailed';

describe('Extended Domain: Analytics', () => {
  describe('AnalyticsExecution', () => {
    it('should create with pending status', () => {
      var exec = AnalyticsExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = AnalyticsExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = AnalyticsExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = AnalyticsExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = AnalyticsExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = AnalyticsExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('AnalyticsThreshold', () => {
    it('should create within bounds', () => {
      var t = AnalyticsThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => AnalyticsThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = AnalyticsThreshold.create(10);
      var high = AnalyticsThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('AnalyticsTimeWindow', () => {
    it('should create from minutes', () => {
      var w = AnalyticsTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = AnalyticsTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = AnalyticsTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => AnalyticsTimeWindow.create(100, 0)).toThrow();
      expect(() => AnalyticsTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('AnalyticsPriority', () => {
    it('should create with valid value', () => {
      var p1 = AnalyticsPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => AnalyticsPriority.create(15)).toThrow();
      expect(() => AnalyticsPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(AnalyticsPriority.low().isLow()).toBe(true);
      expect(AnalyticsPriority.medium().isMedium()).toBe(true);
      expect(AnalyticsPriority.high().isHigh()).toBe(true);
      expect(AnalyticsPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('AnalyticsExecuted Event', () => {
    it('should create event', () => {
      var ev = AnalyticsExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = AnalyticsExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AnalyticsFailed Event', () => {
    it('should create failed event', () => {
      var ev = AnalyticsFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
