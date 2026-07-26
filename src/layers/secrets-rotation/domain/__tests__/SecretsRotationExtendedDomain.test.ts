/**
 * Extended domain tests for SecretsRotation
 */

import { SecretsRotationExecution } from '../entities/SecretsRotationExecution';
import { SecretsRotationConfigState as SecretsRotationConfigEntity } from '../entities/SecretsRotationConfigState';
import { SecretsRotationMetricsSnapshot } from '../entities/SecretsRotationMetricsSnapshot';
import { SecretsRotationThreshold } from '../value-objects/SecretsRotationThreshold';
import { SecretsRotationTimeWindow } from '../value-objects/SecretsRotationTimeWindow';
import { SecretsRotationPriority } from '../value-objects/SecretsRotationPriority';
import { SecretsRotationExecuted } from '../events/SecretsRotationExecuted';
import { SecretsRotationFailed } from '../events/SecretsRotationFailed';

describe('Extended Domain: SecretsRotation', () => {
  describe('SecretsRotationExecution', () => {
    it('should create with pending status', () => {
      var exec = SecretsRotationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SecretsRotationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SecretsRotationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SecretsRotationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SecretsRotationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SecretsRotationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SecretsRotationThreshold', () => {
    it('should create within bounds', () => {
      var t = SecretsRotationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SecretsRotationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SecretsRotationThreshold.create(10);
      var high = SecretsRotationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SecretsRotationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SecretsRotationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SecretsRotationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SecretsRotationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SecretsRotationTimeWindow.create(100, 0)).toThrow();
      expect(() => SecretsRotationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SecretsRotationPriority', () => {
    it('should create with valid value', () => {
      var p1 = SecretsRotationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SecretsRotationPriority.create(15)).toThrow();
      expect(() => SecretsRotationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SecretsRotationPriority.low().isLow()).toBe(true);
      expect(SecretsRotationPriority.medium().isMedium()).toBe(true);
      expect(SecretsRotationPriority.high().isHigh()).toBe(true);
      expect(SecretsRotationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SecretsRotationExecuted Event', () => {
    it('should create event', () => {
      var ev = SecretsRotationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SecretsRotationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SecretsRotationFailed Event', () => {
    it('should create failed event', () => {
      var ev = SecretsRotationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
