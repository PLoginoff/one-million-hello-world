/**
 * Extended domain tests for Sso
 */

import { SsoExecution } from '../entities/SsoExecution';
import { SsoConfigState as SsoConfigEntity } from '../entities/SsoConfigState';
import { SsoMetricsSnapshot } from '../entities/SsoMetricsSnapshot';
import { SsoThreshold } from '../value-objects/SsoThreshold';
import { SsoTimeWindow } from '../value-objects/SsoTimeWindow';
import { SsoPriority } from '../value-objects/SsoPriority';
import { SsoExecuted } from '../events/SsoExecuted';
import { SsoFailed } from '../events/SsoFailed';

describe('Extended Domain: Sso', () => {
  describe('SsoExecution', () => {
    it('should create with pending status', () => {
      var exec = SsoExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SsoExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SsoExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SsoExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SsoExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SsoExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SsoThreshold', () => {
    it('should create within bounds', () => {
      var t = SsoThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SsoThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SsoThreshold.create(10);
      var high = SsoThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SsoTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SsoTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SsoTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SsoTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SsoTimeWindow.create(100, 0)).toThrow();
      expect(() => SsoTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SsoPriority', () => {
    it('should create with valid value', () => {
      var p1 = SsoPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SsoPriority.create(15)).toThrow();
      expect(() => SsoPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SsoPriority.low().isLow()).toBe(true);
      expect(SsoPriority.medium().isMedium()).toBe(true);
      expect(SsoPriority.high().isHigh()).toBe(true);
      expect(SsoPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SsoExecuted Event', () => {
    it('should create event', () => {
      var ev = SsoExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SsoExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SsoFailed Event', () => {
    it('should create failed event', () => {
      var ev = SsoFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
