/**
 * Extended domain tests for Middleware
 */

import { MiddlewareExecution } from '../entities/MiddlewareExecution';
import { MiddlewareConfigState as MiddlewareConfigEntity } from '../entities/MiddlewareConfigState';
import { MiddlewareMetrics } from '../entities/MiddlewareMetrics';
import { MiddlewareThreshold } from '../value-objects/MiddlewareThreshold';
import { MiddlewareTimeWindow } from '../value-objects/MiddlewareTimeWindow';
import { MiddlewarePriority } from '../value-objects/MiddlewarePriority';
import { MiddlewareExecuted } from '../events/MiddlewareExecuted';
import { MiddlewareFailed } from '../events/MiddlewareFailed';

describe('Extended Domain: Middleware', () => {
  describe('MiddlewareExecution', () => {
    it('should create with pending status', () => {
      var exec = MiddlewareExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MiddlewareExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MiddlewareExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MiddlewareExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MiddlewareExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MiddlewareExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MiddlewareThreshold', () => {
    it('should create within bounds', () => {
      var t = MiddlewareThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MiddlewareThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MiddlewareThreshold.create(10);
      var high = MiddlewareThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MiddlewareTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MiddlewareTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MiddlewareTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MiddlewareTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MiddlewareTimeWindow.create(100, 0)).toThrow();
      expect(() => MiddlewareTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MiddlewarePriority', () => {
    it('should create with valid value', () => {
      var p1 = MiddlewarePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MiddlewarePriority.create(15)).toThrow();
      expect(() => MiddlewarePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MiddlewarePriority.low().isLow()).toBe(true);
      expect(MiddlewarePriority.medium().isMedium()).toBe(true);
      expect(MiddlewarePriority.high().isHigh()).toBe(true);
      expect(MiddlewarePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MiddlewareExecuted Event', () => {
    it('should create event', () => {
      var ev = MiddlewareExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MiddlewareExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MiddlewareFailed Event', () => {
    it('should create failed event', () => {
      var ev = MiddlewareFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
