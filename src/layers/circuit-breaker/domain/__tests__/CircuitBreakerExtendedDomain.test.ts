/**
 * Extended domain tests for CircuitBreaker
 */

import { CircuitBreakerExecution } from '../entities/CircuitBreakerExecution';
import { CircuitBreakerConfigState as CircuitBreakerConfigEntity } from '../entities/CircuitBreakerConfigState';
import { CircuitBreakerMetricsSnapshot } from '../entities/CircuitBreakerMetricsSnapshot';
import { CircuitBreakerThreshold } from '../value-objects/CircuitBreakerThreshold';
import { CircuitBreakerTimeWindow } from '../value-objects/CircuitBreakerTimeWindow';
import { CircuitBreakerPriority } from '../value-objects/CircuitBreakerPriority';
import { CircuitBreakerExecuted } from '../events/CircuitBreakerExecuted';
import { CircuitBreakerFailed } from '../events/CircuitBreakerFailed';

describe('Extended Domain: CircuitBreaker', () => {
  describe('CircuitBreakerExecution', () => {
    it('should create with pending status', () => {
      var exec = CircuitBreakerExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = CircuitBreakerExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = CircuitBreakerExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = CircuitBreakerExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = CircuitBreakerExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = CircuitBreakerExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('CircuitBreakerThreshold', () => {
    it('should create within bounds', () => {
      var t = CircuitBreakerThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => CircuitBreakerThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = CircuitBreakerThreshold.create(10);
      var high = CircuitBreakerThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('CircuitBreakerTimeWindow', () => {
    it('should create from minutes', () => {
      var w = CircuitBreakerTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = CircuitBreakerTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = CircuitBreakerTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => CircuitBreakerTimeWindow.create(100, 0)).toThrow();
      expect(() => CircuitBreakerTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('CircuitBreakerPriority', () => {
    it('should create with valid value', () => {
      var p1 = CircuitBreakerPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => CircuitBreakerPriority.create(15)).toThrow();
      expect(() => CircuitBreakerPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(CircuitBreakerPriority.low().isLow()).toBe(true);
      expect(CircuitBreakerPriority.medium().isMedium()).toBe(true);
      expect(CircuitBreakerPriority.high().isHigh()).toBe(true);
      expect(CircuitBreakerPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('CircuitBreakerExecuted Event', () => {
    it('should create event', () => {
      var ev = CircuitBreakerExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = CircuitBreakerExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CircuitBreakerFailed Event', () => {
    it('should create failed event', () => {
      var ev = CircuitBreakerFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
