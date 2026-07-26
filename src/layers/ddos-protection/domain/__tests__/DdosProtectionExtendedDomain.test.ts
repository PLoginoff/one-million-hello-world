/**
 * Extended domain tests for DdosProtection
 */

import { DdosProtectionExecution } from '../entities/DdosProtectionExecution';
import { DdosProtectionConfigState as DdosProtectionConfigEntity } from '../entities/DdosProtectionConfigState';
import { DdosProtectionMetricsSnapshot } from '../entities/DdosProtectionMetricsSnapshot';
import { DdosProtectionThreshold } from '../value-objects/DdosProtectionThreshold';
import { DdosProtectionTimeWindow } from '../value-objects/DdosProtectionTimeWindow';
import { DdosProtectionPriority } from '../value-objects/DdosProtectionPriority';
import { DdosProtectionExecuted } from '../events/DdosProtectionExecuted';
import { DdosProtectionFailed } from '../events/DdosProtectionFailed';

describe('Extended Domain: DdosProtection', () => {
  describe('DdosProtectionExecution', () => {
    it('should create with pending status', () => {
      var exec = DdosProtectionExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DdosProtectionExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DdosProtectionExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DdosProtectionExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DdosProtectionExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DdosProtectionExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DdosProtectionThreshold', () => {
    it('should create within bounds', () => {
      var t = DdosProtectionThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DdosProtectionThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DdosProtectionThreshold.create(10);
      var high = DdosProtectionThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DdosProtectionTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DdosProtectionTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DdosProtectionTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DdosProtectionTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DdosProtectionTimeWindow.create(100, 0)).toThrow();
      expect(() => DdosProtectionTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DdosProtectionPriority', () => {
    it('should create with valid value', () => {
      var p1 = DdosProtectionPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DdosProtectionPriority.create(15)).toThrow();
      expect(() => DdosProtectionPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DdosProtectionPriority.low().isLow()).toBe(true);
      expect(DdosProtectionPriority.medium().isMedium()).toBe(true);
      expect(DdosProtectionPriority.high().isHigh()).toBe(true);
      expect(DdosProtectionPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DdosProtectionExecuted Event', () => {
    it('should create event', () => {
      var ev = DdosProtectionExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DdosProtectionExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DdosProtectionFailed Event', () => {
    it('should create failed event', () => {
      var ev = DdosProtectionFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
