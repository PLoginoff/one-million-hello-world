/**
 * Extended domain tests for DisasterRecovery
 */

import { DisasterRecoveryExecution } from '../entities/DisasterRecoveryExecution';
import { DisasterRecoveryConfigState as DisasterRecoveryConfigEntity } from '../entities/DisasterRecoveryConfigState';
import { DisasterRecoveryMetricsSnapshot } from '../entities/DisasterRecoveryMetricsSnapshot';
import { DisasterRecoveryThreshold } from '../value-objects/DisasterRecoveryThreshold';
import { DisasterRecoveryTimeWindow } from '../value-objects/DisasterRecoveryTimeWindow';
import { DisasterRecoveryPriority } from '../value-objects/DisasterRecoveryPriority';
import { DisasterRecoveryExecuted } from '../events/DisasterRecoveryExecuted';
import { DisasterRecoveryFailed } from '../events/DisasterRecoveryFailed';

describe('Extended Domain: DisasterRecovery', () => {
  describe('DisasterRecoveryExecution', () => {
    it('should create with pending status', () => {
      var exec = DisasterRecoveryExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DisasterRecoveryExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DisasterRecoveryExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DisasterRecoveryExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DisasterRecoveryExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DisasterRecoveryExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DisasterRecoveryThreshold', () => {
    it('should create within bounds', () => {
      var t = DisasterRecoveryThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DisasterRecoveryThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DisasterRecoveryThreshold.create(10);
      var high = DisasterRecoveryThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DisasterRecoveryTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DisasterRecoveryTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DisasterRecoveryTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DisasterRecoveryTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DisasterRecoveryTimeWindow.create(100, 0)).toThrow();
      expect(() => DisasterRecoveryTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DisasterRecoveryPriority', () => {
    it('should create with valid value', () => {
      var p1 = DisasterRecoveryPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DisasterRecoveryPriority.create(15)).toThrow();
      expect(() => DisasterRecoveryPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DisasterRecoveryPriority.low().isLow()).toBe(true);
      expect(DisasterRecoveryPriority.medium().isMedium()).toBe(true);
      expect(DisasterRecoveryPriority.high().isHigh()).toBe(true);
      expect(DisasterRecoveryPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DisasterRecoveryExecuted Event', () => {
    it('should create event', () => {
      var ev = DisasterRecoveryExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DisasterRecoveryExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DisasterRecoveryFailed Event', () => {
    it('should create failed event', () => {
      var ev = DisasterRecoveryFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
