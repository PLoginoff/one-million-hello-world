/**
 * Extended domain tests for Serialization
 */

import { SerializationExecution } from '../entities/SerializationExecution';
import { SerializationConfigState as SerializationConfigEntity } from '../entities/SerializationConfigState';
import { SerializationMetricsSnapshot } from '../entities/SerializationMetricsSnapshot';
import { SerializationThreshold } from '../value-objects/SerializationThreshold';
import { SerializationTimeWindow } from '../value-objects/SerializationTimeWindow';
import { SerializationPriority } from '../value-objects/SerializationPriority';
import { SerializationExecuted } from '../events/SerializationExecuted';
import { SerializationFailed } from '../events/SerializationFailed';

describe('Extended Domain: Serialization', () => {
  describe('SerializationExecution', () => {
    it('should create with pending status', () => {
      var exec = SerializationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SerializationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SerializationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SerializationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SerializationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SerializationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SerializationThreshold', () => {
    it('should create within bounds', () => {
      var t = SerializationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SerializationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SerializationThreshold.create(10);
      var high = SerializationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SerializationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SerializationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SerializationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SerializationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SerializationTimeWindow.create(100, 0)).toThrow();
      expect(() => SerializationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SerializationPriority', () => {
    it('should create with valid value', () => {
      var p1 = SerializationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SerializationPriority.create(15)).toThrow();
      expect(() => SerializationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SerializationPriority.low().isLow()).toBe(true);
      expect(SerializationPriority.medium().isMedium()).toBe(true);
      expect(SerializationPriority.high().isHigh()).toBe(true);
      expect(SerializationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SerializationExecuted Event', () => {
    it('should create event', () => {
      var ev = SerializationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SerializationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SerializationFailed Event', () => {
    it('should create failed event', () => {
      var ev = SerializationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
