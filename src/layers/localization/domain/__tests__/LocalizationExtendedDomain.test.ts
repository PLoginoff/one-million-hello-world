/**
 * Extended domain tests for Localization
 */

import { LocalizationExecution } from '../entities/LocalizationExecution';
import { LocalizationConfigState as LocalizationConfigEntity } from '../entities/LocalizationConfigState';
import { LocalizationMetricsSnapshot } from '../entities/LocalizationMetricsSnapshot';
import { LocalizationThreshold } from '../value-objects/LocalizationThreshold';
import { LocalizationTimeWindow } from '../value-objects/LocalizationTimeWindow';
import { LocalizationPriority } from '../value-objects/LocalizationPriority';
import { LocalizationExecuted } from '../events/LocalizationExecuted';
import { LocalizationFailed } from '../events/LocalizationFailed';

describe('Extended Domain: Localization', () => {
  describe('LocalizationExecution', () => {
    it('should create with pending status', () => {
      var exec = LocalizationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = LocalizationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = LocalizationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = LocalizationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = LocalizationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = LocalizationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('LocalizationThreshold', () => {
    it('should create within bounds', () => {
      var t = LocalizationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => LocalizationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = LocalizationThreshold.create(10);
      var high = LocalizationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('LocalizationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = LocalizationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = LocalizationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = LocalizationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => LocalizationTimeWindow.create(100, 0)).toThrow();
      expect(() => LocalizationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('LocalizationPriority', () => {
    it('should create with valid value', () => {
      var p1 = LocalizationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => LocalizationPriority.create(15)).toThrow();
      expect(() => LocalizationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(LocalizationPriority.low().isLow()).toBe(true);
      expect(LocalizationPriority.medium().isMedium()).toBe(true);
      expect(LocalizationPriority.high().isHigh()).toBe(true);
      expect(LocalizationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('LocalizationExecuted Event', () => {
    it('should create event', () => {
      var ev = LocalizationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = LocalizationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('LocalizationFailed Event', () => {
    it('should create failed event', () => {
      var ev = LocalizationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
