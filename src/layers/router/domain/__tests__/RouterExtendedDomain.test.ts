/**
 * Extended domain tests for Router
 */

import { RouterExecution } from '../entities/RouterExecution';
import { RouterConfigState as RouterConfigEntity } from '../entities/RouterConfigState';
import { RouterMetrics } from '../entities/RouterMetrics';
import { RouterThreshold } from '../value-objects/RouterThreshold';
import { RouterTimeWindow } from '../value-objects/RouterTimeWindow';
import { RouterPriority } from '../value-objects/RouterPriority';
import { RouterExecuted } from '../events/RouterExecuted';
import { RouterFailed } from '../events/RouterFailed';

describe('Extended Domain: Router', () => {
  describe('RouterExecution', () => {
    it('should create with pending status', () => {
      var exec = RouterExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = RouterExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = RouterExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = RouterExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = RouterExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = RouterExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('RouterThreshold', () => {
    it('should create within bounds', () => {
      var t = RouterThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => RouterThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = RouterThreshold.create(10);
      var high = RouterThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('RouterTimeWindow', () => {
    it('should create from minutes', () => {
      var w = RouterTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = RouterTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = RouterTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => RouterTimeWindow.create(100, 0)).toThrow();
      expect(() => RouterTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('RouterPriority', () => {
    it('should create with valid value', () => {
      var p1 = RouterPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => RouterPriority.create(15)).toThrow();
      expect(() => RouterPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(RouterPriority.low().isLow()).toBe(true);
      expect(RouterPriority.medium().isMedium()).toBe(true);
      expect(RouterPriority.high().isHigh()).toBe(true);
      expect(RouterPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('RouterExecuted Event', () => {
    it('should create event', () => {
      var ev = RouterExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = RouterExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RouterFailed Event', () => {
    it('should create failed event', () => {
      var ev = RouterFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
