/**
 * Extended domain tests for Secrets
 */

import { SecretsExecution } from '../entities/SecretsExecution';
import { SecretsConfigState as SecretsConfigEntity } from '../entities/SecretsConfigState';
import { SecretsMetricsSnapshot } from '../entities/SecretsMetricsSnapshot';
import { SecretsThreshold } from '../value-objects/SecretsThreshold';
import { SecretsTimeWindow } from '../value-objects/SecretsTimeWindow';
import { SecretsPriority } from '../value-objects/SecretsPriority';
import { SecretsExecuted } from '../events/SecretsExecuted';
import { SecretsFailed } from '../events/SecretsFailed';

describe('Extended Domain: Secrets', () => {
  describe('SecretsExecution', () => {
    it('should create with pending status', () => {
      var exec = SecretsExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SecretsExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SecretsExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SecretsExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SecretsExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SecretsExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SecretsThreshold', () => {
    it('should create within bounds', () => {
      var t = SecretsThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SecretsThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SecretsThreshold.create(10);
      var high = SecretsThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SecretsTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SecretsTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SecretsTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SecretsTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SecretsTimeWindow.create(100, 0)).toThrow();
      expect(() => SecretsTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SecretsPriority', () => {
    it('should create with valid value', () => {
      var p1 = SecretsPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SecretsPriority.create(15)).toThrow();
      expect(() => SecretsPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SecretsPriority.low().isLow()).toBe(true);
      expect(SecretsPriority.medium().isMedium()).toBe(true);
      expect(SecretsPriority.high().isHigh()).toBe(true);
      expect(SecretsPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SecretsExecuted Event', () => {
    it('should create event', () => {
      var ev = SecretsExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SecretsExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SecretsFailed Event', () => {
    it('should create failed event', () => {
      var ev = SecretsFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
