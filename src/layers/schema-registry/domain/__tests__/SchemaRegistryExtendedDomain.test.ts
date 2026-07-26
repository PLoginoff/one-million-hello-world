/**
 * Extended domain tests for SchemaRegistry
 */

import { SchemaRegistryExecution } from '../entities/SchemaRegistryExecution';
import { SchemaRegistryConfigState as SchemaRegistryConfigEntity } from '../entities/SchemaRegistryConfigState';
import { SchemaRegistryMetricsSnapshot } from '../entities/SchemaRegistryMetricsSnapshot';
import { SchemaRegistryThreshold } from '../value-objects/SchemaRegistryThreshold';
import { SchemaRegistryTimeWindow } from '../value-objects/SchemaRegistryTimeWindow';
import { SchemaRegistryPriority } from '../value-objects/SchemaRegistryPriority';
import { SchemaRegistryExecuted } from '../events/SchemaRegistryExecuted';
import { SchemaRegistryFailed } from '../events/SchemaRegistryFailed';

describe('Extended Domain: SchemaRegistry', () => {
  describe('SchemaRegistryExecution', () => {
    it('should create with pending status', () => {
      var exec = SchemaRegistryExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SchemaRegistryExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SchemaRegistryExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SchemaRegistryExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SchemaRegistryExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SchemaRegistryExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SchemaRegistryThreshold', () => {
    it('should create within bounds', () => {
      var t = SchemaRegistryThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SchemaRegistryThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SchemaRegistryThreshold.create(10);
      var high = SchemaRegistryThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SchemaRegistryTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SchemaRegistryTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SchemaRegistryTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SchemaRegistryTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SchemaRegistryTimeWindow.create(100, 0)).toThrow();
      expect(() => SchemaRegistryTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SchemaRegistryPriority', () => {
    it('should create with valid value', () => {
      var p1 = SchemaRegistryPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SchemaRegistryPriority.create(15)).toThrow();
      expect(() => SchemaRegistryPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SchemaRegistryPriority.low().isLow()).toBe(true);
      expect(SchemaRegistryPriority.medium().isMedium()).toBe(true);
      expect(SchemaRegistryPriority.high().isHigh()).toBe(true);
      expect(SchemaRegistryPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SchemaRegistryExecuted Event', () => {
    it('should create event', () => {
      var ev = SchemaRegistryExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SchemaRegistryExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SchemaRegistryFailed Event', () => {
    it('should create failed event', () => {
      var ev = SchemaRegistryFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
