/**
 * Extended domain tests for Authorization
 */

import { AuthorizationExecution } from '../entities/AuthorizationExecution';
import { AuthorizationConfigState as AuthorizationConfigEntity } from '../entities/AuthorizationConfigState';
import { AuthorizationMetricsSnapshot } from '../entities/AuthorizationMetricsSnapshot';
import { AuthorizationThreshold } from '../value-objects/AuthorizationThreshold';
import { AuthorizationTimeWindow } from '../value-objects/AuthorizationTimeWindow';
import { AuthorizationPriority } from '../value-objects/AuthorizationPriority';
import { AuthorizationExecuted } from '../events/AuthorizationExecuted';
import { AuthorizationFailed } from '../events/AuthorizationFailed';

describe('Extended Domain: Authorization', () => {
  describe('AuthorizationExecution', () => {
    it('should create with pending status', () => {
      var exec = AuthorizationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = AuthorizationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = AuthorizationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = AuthorizationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = AuthorizationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = AuthorizationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('AuthorizationThreshold', () => {
    it('should create within bounds', () => {
      var t = AuthorizationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => AuthorizationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = AuthorizationThreshold.create(10);
      var high = AuthorizationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('AuthorizationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = AuthorizationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = AuthorizationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = AuthorizationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => AuthorizationTimeWindow.create(100, 0)).toThrow();
      expect(() => AuthorizationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('AuthorizationPriority', () => {
    it('should create with valid value', () => {
      var p1 = AuthorizationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => AuthorizationPriority.create(15)).toThrow();
      expect(() => AuthorizationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(AuthorizationPriority.low().isLow()).toBe(true);
      expect(AuthorizationPriority.medium().isMedium()).toBe(true);
      expect(AuthorizationPriority.high().isHigh()).toBe(true);
      expect(AuthorizationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('AuthorizationExecuted Event', () => {
    it('should create event', () => {
      var ev = AuthorizationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = AuthorizationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AuthorizationFailed Event', () => {
    it('should create failed event', () => {
      var ev = AuthorizationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
