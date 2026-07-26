/**
 * Extended domain tests for Encryption
 */

import { EncryptionExecution } from '../entities/EncryptionExecution';
import { EncryptionConfigState as EncryptionConfigEntity } from '../entities/EncryptionConfigState';
import { EncryptionMetricsSnapshot } from '../entities/EncryptionMetricsSnapshot';
import { EncryptionThreshold } from '../value-objects/EncryptionThreshold';
import { EncryptionTimeWindow } from '../value-objects/EncryptionTimeWindow';
import { EncryptionPriority } from '../value-objects/EncryptionPriority';
import { EncryptionExecuted } from '../events/EncryptionExecuted';
import { EncryptionFailed } from '../events/EncryptionFailed';

describe('Extended Domain: Encryption', () => {
  describe('EncryptionExecution', () => {
    it('should create with pending status', () => {
      var exec = EncryptionExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = EncryptionExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = EncryptionExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = EncryptionExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = EncryptionExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = EncryptionExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('EncryptionThreshold', () => {
    it('should create within bounds', () => {
      var t = EncryptionThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => EncryptionThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = EncryptionThreshold.create(10);
      var high = EncryptionThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('EncryptionTimeWindow', () => {
    it('should create from minutes', () => {
      var w = EncryptionTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = EncryptionTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = EncryptionTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => EncryptionTimeWindow.create(100, 0)).toThrow();
      expect(() => EncryptionTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('EncryptionPriority', () => {
    it('should create with valid value', () => {
      var p1 = EncryptionPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => EncryptionPriority.create(15)).toThrow();
      expect(() => EncryptionPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(EncryptionPriority.low().isLow()).toBe(true);
      expect(EncryptionPriority.medium().isMedium()).toBe(true);
      expect(EncryptionPriority.high().isHigh()).toBe(true);
      expect(EncryptionPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('EncryptionExecuted Event', () => {
    it('should create event', () => {
      var ev = EncryptionExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = EncryptionExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EncryptionFailed Event', () => {
    it('should create failed event', () => {
      var ev = EncryptionFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
