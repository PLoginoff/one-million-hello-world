/**
 * Extended domain tests for Waf
 */

import { WafExecution } from '../entities/WafExecution';
import { WafConfigState as WafConfigEntity } from '../entities/WafConfigState';
import { WafMetricsSnapshot } from '../entities/WafMetricsSnapshot';
import { WafThreshold } from '../value-objects/WafThreshold';
import { WafTimeWindow } from '../value-objects/WafTimeWindow';
import { WafPriority } from '../value-objects/WafPriority';
import { WafExecuted } from '../events/WafExecuted';
import { WafFailed } from '../events/WafFailed';

describe('Extended Domain: Waf', () => {
  describe('WafExecution', () => {
    it('should create with pending status', () => {
      var exec = WafExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = WafExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = WafExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = WafExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = WafExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = WafExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('WafThreshold', () => {
    it('should create within bounds', () => {
      var t = WafThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => WafThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = WafThreshold.create(10);
      var high = WafThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('WafTimeWindow', () => {
    it('should create from minutes', () => {
      var w = WafTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = WafTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = WafTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => WafTimeWindow.create(100, 0)).toThrow();
      expect(() => WafTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('WafPriority', () => {
    it('should create with valid value', () => {
      var p1 = WafPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => WafPriority.create(15)).toThrow();
      expect(() => WafPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(WafPriority.low().isLow()).toBe(true);
      expect(WafPriority.medium().isMedium()).toBe(true);
      expect(WafPriority.high().isHigh()).toBe(true);
      expect(WafPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('WafExecuted Event', () => {
    it('should create event', () => {
      var ev = WafExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = WafExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('WafFailed Event', () => {
    it('should create failed event', () => {
      var ev = WafFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
