/**
 * Extended domain tests for EdgeCache
 */

import { EdgeCacheExecution } from '../entities/EdgeCacheExecution';
import { EdgeCacheConfigState as EdgeCacheConfigEntity } from '../entities/EdgeCacheConfigState';
import { EdgeCacheMetricsSnapshot } from '../entities/EdgeCacheMetricsSnapshot';
import { EdgeCacheThreshold } from '../value-objects/EdgeCacheThreshold';
import { EdgeCacheTimeWindow } from '../value-objects/EdgeCacheTimeWindow';
import { EdgeCachePriority } from '../value-objects/EdgeCachePriority';
import { EdgeCacheExecuted } from '../events/EdgeCacheExecuted';
import { EdgeCacheFailed } from '../events/EdgeCacheFailed';

describe('Extended Domain: EdgeCache', () => {
  describe('EdgeCacheExecution', () => {
    it('should create with pending status', () => {
      var exec = EdgeCacheExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = EdgeCacheExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = EdgeCacheExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = EdgeCacheExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = EdgeCacheExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = EdgeCacheExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('EdgeCacheThreshold', () => {
    it('should create within bounds', () => {
      var t = EdgeCacheThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => EdgeCacheThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = EdgeCacheThreshold.create(10);
      var high = EdgeCacheThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('EdgeCacheTimeWindow', () => {
    it('should create from minutes', () => {
      var w = EdgeCacheTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = EdgeCacheTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = EdgeCacheTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => EdgeCacheTimeWindow.create(100, 0)).toThrow();
      expect(() => EdgeCacheTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('EdgeCachePriority', () => {
    it('should create with valid value', () => {
      var p1 = EdgeCachePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => EdgeCachePriority.create(15)).toThrow();
      expect(() => EdgeCachePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(EdgeCachePriority.low().isLow()).toBe(true);
      expect(EdgeCachePriority.medium().isMedium()).toBe(true);
      expect(EdgeCachePriority.high().isHigh()).toBe(true);
      expect(EdgeCachePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('EdgeCacheExecuted Event', () => {
    it('should create event', () => {
      var ev = EdgeCacheExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = EdgeCacheExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EdgeCacheFailed Event', () => {
    it('should create failed event', () => {
      var ev = EdgeCacheFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
