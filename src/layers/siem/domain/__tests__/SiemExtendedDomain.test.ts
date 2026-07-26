/**
 * Extended domain tests for Siem
 */

import { SiemExecution } from '../entities/SiemExecution';
import { SiemConfigState as SiemConfigEntity } from '../entities/SiemConfigState';
import { SiemMetricsSnapshot } from '../entities/SiemMetricsSnapshot';
import { SiemThreshold } from '../value-objects/SiemThreshold';
import { SiemTimeWindow } from '../value-objects/SiemTimeWindow';
import { SiemPriority } from '../value-objects/SiemPriority';
import { SiemExecuted } from '../events/SiemExecuted';
import { SiemFailed } from '../events/SiemFailed';

describe('Extended Domain: Siem', () => {
  describe('SiemExecution', () => {
    it('should create with pending status', () => {
      var exec = SiemExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SiemExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SiemExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SiemExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SiemExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SiemExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SiemThreshold', () => {
    it('should create within bounds', () => {
      var t = SiemThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SiemThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SiemThreshold.create(10);
      var high = SiemThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SiemTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SiemTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SiemTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SiemTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SiemTimeWindow.create(100, 0)).toThrow();
      expect(() => SiemTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SiemPriority', () => {
    it('should create with valid value', () => {
      var p1 = SiemPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SiemPriority.create(15)).toThrow();
      expect(() => SiemPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SiemPriority.low().isLow()).toBe(true);
      expect(SiemPriority.medium().isMedium()).toBe(true);
      expect(SiemPriority.high().isHigh()).toBe(true);
      expect(SiemPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SiemExecuted Event', () => {
    it('should create event', () => {
      var ev = SiemExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SiemExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SiemFailed Event', () => {
    it('should create failed event', () => {
      var ev = SiemFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
