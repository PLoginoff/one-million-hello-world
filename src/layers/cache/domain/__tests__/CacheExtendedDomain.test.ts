/**
 * Extended domain tests for Cache
 */

import { CacheExecution } from '../entities/CacheExecution';
import { CacheConfigState as CacheConfigEntity } from '../entities/CacheConfigState';
import { CacheMetrics } from '../entities/CacheMetrics';
import { CacheThreshold } from '../value-objects/CacheThreshold';
import { CacheTimeWindow } from '../value-objects/CacheTimeWindow';
import { CachePriority } from '../value-objects/CachePriority';
import { CacheExecuted } from '../events/CacheExecuted';
import { CacheFailed } from '../events/CacheFailed';

describe('Extended Domain: Cache', () => {
  describe('CacheExecution', () => {
    it('should create with pending status', () => {
      var exec = CacheExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = CacheExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = CacheExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = CacheExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = CacheExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = CacheExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('CacheThreshold', () => {
    it('should create within bounds', () => {
      var t = CacheThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => CacheThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = CacheThreshold.create(10);
      var high = CacheThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('CacheTimeWindow', () => {
    it('should create from minutes', () => {
      var w = CacheTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = CacheTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = CacheTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => CacheTimeWindow.create(100, 0)).toThrow();
      expect(() => CacheTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('CachePriority', () => {
    it('should create with valid value', () => {
      var p1 = CachePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => CachePriority.create(15)).toThrow();
      expect(() => CachePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(CachePriority.low().isLow()).toBe(true);
      expect(CachePriority.medium().isMedium()).toBe(true);
      expect(CachePriority.high().isHigh()).toBe(true);
      expect(CachePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('CacheExecuted Event', () => {
    it('should create event', () => {
      var ev = CacheExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = CacheExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CacheFailed Event', () => {
    it('should create failed event', () => {
      var ev = CacheFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
