/**
 * Extended domain tests for Security
 */

import { SecurityExecution } from '../entities/SecurityExecution';
import { SecurityConfigState as SecurityConfigEntity } from '../entities/SecurityConfigState';
import { SecurityMetricsSnapshot } from '../entities/SecurityMetricsSnapshot';
import { SecurityThreshold } from '../value-objects/SecurityThreshold';
import { SecurityTimeWindow } from '../value-objects/SecurityTimeWindow';
import { SecurityPriority } from '../value-objects/SecurityPriority';
import { SecurityExecuted } from '../events/SecurityExecuted';
import { SecurityFailed } from '../events/SecurityFailed';

describe('Extended Domain: Security', () => {
  describe('SecurityExecution', () => {
    it('should create with pending status', () => {
      var exec = SecurityExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SecurityExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SecurityExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SecurityExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SecurityExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SecurityExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SecurityThreshold', () => {
    it('should create within bounds', () => {
      var t = SecurityThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SecurityThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SecurityThreshold.create(10);
      var high = SecurityThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SecurityTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SecurityTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SecurityTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SecurityTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SecurityTimeWindow.create(100, 0)).toThrow();
      expect(() => SecurityTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SecurityPriority', () => {
    it('should create with valid value', () => {
      var p1 = SecurityPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SecurityPriority.create(15)).toThrow();
      expect(() => SecurityPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SecurityPriority.low().isLow()).toBe(true);
      expect(SecurityPriority.medium().isMedium()).toBe(true);
      expect(SecurityPriority.high().isHigh()).toBe(true);
      expect(SecurityPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SecurityExecuted Event', () => {
    it('should create event', () => {
      var ev = SecurityExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SecurityExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SecurityFailed Event', () => {
    it('should create failed event', () => {
      var ev = SecurityFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
