/**
 * Extended domain tests for Facade
 */

import { FacadeExecution } from '../entities/FacadeExecution';
import { FacadeConfigState as FacadeConfigEntity } from '../entities/FacadeConfigState';
import { FacadeMetricsSnapshot } from '../entities/FacadeMetricsSnapshot';
import { FacadeThreshold } from '../value-objects/FacadeThreshold';
import { FacadeTimeWindow } from '../value-objects/FacadeTimeWindow';
import { FacadePriority } from '../value-objects/FacadePriority';
import { FacadeExecuted } from '../events/FacadeExecuted';
import { FacadeFailed } from '../events/FacadeFailed';

describe('Extended Domain: Facade', () => {
  describe('FacadeExecution', () => {
    it('should create with pending status', () => {
      var exec = FacadeExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = FacadeExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = FacadeExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = FacadeExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = FacadeExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = FacadeExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('FacadeThreshold', () => {
    it('should create within bounds', () => {
      var t = FacadeThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => FacadeThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = FacadeThreshold.create(10);
      var high = FacadeThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('FacadeTimeWindow', () => {
    it('should create from minutes', () => {
      var w = FacadeTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = FacadeTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = FacadeTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => FacadeTimeWindow.create(100, 0)).toThrow();
      expect(() => FacadeTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('FacadePriority', () => {
    it('should create with valid value', () => {
      var p1 = FacadePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => FacadePriority.create(15)).toThrow();
      expect(() => FacadePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(FacadePriority.low().isLow()).toBe(true);
      expect(FacadePriority.medium().isMedium()).toBe(true);
      expect(FacadePriority.high().isHigh()).toBe(true);
      expect(FacadePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('FacadeExecuted Event', () => {
    it('should create event', () => {
      var ev = FacadeExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = FacadeExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FacadeFailed Event', () => {
    it('should create failed event', () => {
      var ev = FacadeFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
