/**
 * Extended domain tests for DeadLetter
 */

import { DeadLetterExecution } from '../entities/DeadLetterExecution';
import { DeadLetterConfigState as DeadLetterConfigEntity } from '../entities/DeadLetterConfigState';
import { DeadLetterMetricsSnapshot } from '../entities/DeadLetterMetricsSnapshot';
import { DeadLetterThreshold } from '../value-objects/DeadLetterThreshold';
import { DeadLetterTimeWindow } from '../value-objects/DeadLetterTimeWindow';
import { DeadLetterPriority } from '../value-objects/DeadLetterPriority';
import { DeadLetterExecuted } from '../events/DeadLetterExecuted';
import { DeadLetterFailed } from '../events/DeadLetterFailed';

describe('Extended Domain: DeadLetter', () => {
  describe('DeadLetterExecution', () => {
    it('should create with pending status', () => {
      var exec = DeadLetterExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DeadLetterExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DeadLetterExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DeadLetterExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DeadLetterExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DeadLetterExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DeadLetterThreshold', () => {
    it('should create within bounds', () => {
      var t = DeadLetterThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DeadLetterThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DeadLetterThreshold.create(10);
      var high = DeadLetterThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DeadLetterTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DeadLetterTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DeadLetterTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DeadLetterTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DeadLetterTimeWindow.create(100, 0)).toThrow();
      expect(() => DeadLetterTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DeadLetterPriority', () => {
    it('should create with valid value', () => {
      var p1 = DeadLetterPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DeadLetterPriority.create(15)).toThrow();
      expect(() => DeadLetterPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DeadLetterPriority.low().isLow()).toBe(true);
      expect(DeadLetterPriority.medium().isMedium()).toBe(true);
      expect(DeadLetterPriority.high().isHigh()).toBe(true);
      expect(DeadLetterPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DeadLetterExecuted Event', () => {
    it('should create event', () => {
      var ev = DeadLetterExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DeadLetterExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DeadLetterFailed Event', () => {
    it('should create failed event', () => {
      var ev = DeadLetterFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
