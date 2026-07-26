/**
 * Extended domain tests for Mfa
 */

import { MfaExecution } from '../entities/MfaExecution';
import { MfaConfigState as MfaConfigEntity } from '../entities/MfaConfigState';
import { MfaMetricsSnapshot } from '../entities/MfaMetricsSnapshot';
import { MfaThreshold } from '../value-objects/MfaThreshold';
import { MfaTimeWindow } from '../value-objects/MfaTimeWindow';
import { MfaPriority } from '../value-objects/MfaPriority';
import { MfaExecuted } from '../events/MfaExecuted';
import { MfaFailed } from '../events/MfaFailed';

describe('Extended Domain: Mfa', () => {
  describe('MfaExecution', () => {
    it('should create with pending status', () => {
      var exec = MfaExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MfaExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MfaExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MfaExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MfaExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MfaExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MfaThreshold', () => {
    it('should create within bounds', () => {
      var t = MfaThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MfaThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MfaThreshold.create(10);
      var high = MfaThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MfaTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MfaTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MfaTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MfaTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MfaTimeWindow.create(100, 0)).toThrow();
      expect(() => MfaTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MfaPriority', () => {
    it('should create with valid value', () => {
      var p1 = MfaPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MfaPriority.create(15)).toThrow();
      expect(() => MfaPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MfaPriority.low().isLow()).toBe(true);
      expect(MfaPriority.medium().isMedium()).toBe(true);
      expect(MfaPriority.high().isHigh()).toBe(true);
      expect(MfaPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MfaExecuted Event', () => {
    it('should create event', () => {
      var ev = MfaExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MfaExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MfaFailed Event', () => {
    it('should create failed event', () => {
      var ev = MfaFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
