/**
 * Extended domain tests for Identity
 */

import { IdentityExecution } from '../entities/IdentityExecution';
import { IdentityConfigState as IdentityConfigEntity } from '../entities/IdentityConfigState';
import { IdentityMetricsSnapshot } from '../entities/IdentityMetricsSnapshot';
import { IdentityThreshold } from '../value-objects/IdentityThreshold';
import { IdentityTimeWindow } from '../value-objects/IdentityTimeWindow';
import { IdentityPriority } from '../value-objects/IdentityPriority';
import { IdentityExecuted } from '../events/IdentityExecuted';
import { IdentityFailed } from '../events/IdentityFailed';

describe('Extended Domain: Identity', () => {
  describe('IdentityExecution', () => {
    it('should create with pending status', () => {
      var exec = IdentityExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = IdentityExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = IdentityExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = IdentityExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = IdentityExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = IdentityExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('IdentityThreshold', () => {
    it('should create within bounds', () => {
      var t = IdentityThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => IdentityThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = IdentityThreshold.create(10);
      var high = IdentityThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('IdentityTimeWindow', () => {
    it('should create from minutes', () => {
      var w = IdentityTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = IdentityTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = IdentityTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => IdentityTimeWindow.create(100, 0)).toThrow();
      expect(() => IdentityTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('IdentityPriority', () => {
    it('should create with valid value', () => {
      var p1 = IdentityPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => IdentityPriority.create(15)).toThrow();
      expect(() => IdentityPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(IdentityPriority.low().isLow()).toBe(true);
      expect(IdentityPriority.medium().isMedium()).toBe(true);
      expect(IdentityPriority.high().isHigh()).toBe(true);
      expect(IdentityPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('IdentityExecuted Event', () => {
    it('should create event', () => {
      var ev = IdentityExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = IdentityExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('IdentityFailed Event', () => {
    it('should create failed event', () => {
      var ev = IdentityFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
