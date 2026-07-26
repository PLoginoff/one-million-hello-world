/**
 * Extended domain tests for MutationTesting
 */

import { MutationTestingExecution } from '../entities/MutationTestingExecution';
import { MutationTestingConfigState as MutationTestingConfigEntity } from '../entities/MutationTestingConfigState';
import { MutationTestingMetricsSnapshot } from '../entities/MutationTestingMetricsSnapshot';
import { MutationTestingThreshold } from '../value-objects/MutationTestingThreshold';
import { MutationTestingTimeWindow } from '../value-objects/MutationTestingTimeWindow';
import { MutationTestingPriority } from '../value-objects/MutationTestingPriority';
import { MutationTestingExecuted } from '../events/MutationTestingExecuted';
import { MutationTestingFailed } from '../events/MutationTestingFailed';

describe('Extended Domain: MutationTesting', () => {
  describe('MutationTestingExecution', () => {
    it('should create with pending status', () => {
      var exec = MutationTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MutationTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MutationTestingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MutationTestingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MutationTestingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MutationTestingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MutationTestingThreshold', () => {
    it('should create within bounds', () => {
      var t = MutationTestingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MutationTestingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MutationTestingThreshold.create(10);
      var high = MutationTestingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MutationTestingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MutationTestingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MutationTestingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MutationTestingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MutationTestingTimeWindow.create(100, 0)).toThrow();
      expect(() => MutationTestingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MutationTestingPriority', () => {
    it('should create with valid value', () => {
      var p1 = MutationTestingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MutationTestingPriority.create(15)).toThrow();
      expect(() => MutationTestingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MutationTestingPriority.low().isLow()).toBe(true);
      expect(MutationTestingPriority.medium().isMedium()).toBe(true);
      expect(MutationTestingPriority.high().isHigh()).toBe(true);
      expect(MutationTestingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MutationTestingExecuted Event', () => {
    it('should create event', () => {
      var ev = MutationTestingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MutationTestingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MutationTestingFailed Event', () => {
    it('should create failed event', () => {
      var ev = MutationTestingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
