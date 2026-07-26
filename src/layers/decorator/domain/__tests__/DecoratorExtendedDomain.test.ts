/**
 * Extended domain tests for Decorator
 */

import { DecoratorExecution } from '../entities/DecoratorExecution';
import { DecoratorConfigState as DecoratorConfigEntity } from '../entities/DecoratorConfigState';
import { DecoratorMetricsSnapshot } from '../entities/DecoratorMetricsSnapshot';
import { DecoratorThreshold } from '../value-objects/DecoratorThreshold';
import { DecoratorTimeWindow } from '../value-objects/DecoratorTimeWindow';
import { DecoratorPriority } from '../value-objects/DecoratorPriority';
import { DecoratorExecuted } from '../events/DecoratorExecuted';
import { DecoratorFailed } from '../events/DecoratorFailed';

describe('Extended Domain: Decorator', () => {
  describe('DecoratorExecution', () => {
    it('should create with pending status', () => {
      var exec = DecoratorExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DecoratorExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DecoratorExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DecoratorExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DecoratorExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DecoratorExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DecoratorThreshold', () => {
    it('should create within bounds', () => {
      var t = DecoratorThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DecoratorThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DecoratorThreshold.create(10);
      var high = DecoratorThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DecoratorTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DecoratorTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DecoratorTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DecoratorTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DecoratorTimeWindow.create(100, 0)).toThrow();
      expect(() => DecoratorTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DecoratorPriority', () => {
    it('should create with valid value', () => {
      var p1 = DecoratorPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DecoratorPriority.create(15)).toThrow();
      expect(() => DecoratorPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DecoratorPriority.low().isLow()).toBe(true);
      expect(DecoratorPriority.medium().isMedium()).toBe(true);
      expect(DecoratorPriority.high().isHigh()).toBe(true);
      expect(DecoratorPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DecoratorExecuted Event', () => {
    it('should create event', () => {
      var ev = DecoratorExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DecoratorExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DecoratorFailed Event', () => {
    it('should create failed event', () => {
      var ev = DecoratorFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
