/**
 * Extended domain tests for Cqrs
 */

import { CqrsExecution } from '../entities/CqrsExecution';
import { CqrsConfigState as CqrsConfigEntity } from '../entities/CqrsConfigState';
import { CqrsMetricsSnapshot } from '../entities/CqrsMetricsSnapshot';
import { CqrsThreshold } from '../value-objects/CqrsThreshold';
import { CqrsTimeWindow } from '../value-objects/CqrsTimeWindow';
import { CqrsPriority } from '../value-objects/CqrsPriority';
import { CqrsExecuted } from '../events/CqrsExecuted';
import { CqrsFailed } from '../events/CqrsFailed';

describe('Extended Domain: Cqrs', () => {
  describe('CqrsExecution', () => {
    it('should create with pending status', () => {
      var exec = CqrsExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = CqrsExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = CqrsExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = CqrsExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = CqrsExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = CqrsExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('CqrsThreshold', () => {
    it('should create within bounds', () => {
      var t = CqrsThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => CqrsThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = CqrsThreshold.create(10);
      var high = CqrsThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('CqrsTimeWindow', () => {
    it('should create from minutes', () => {
      var w = CqrsTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = CqrsTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = CqrsTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => CqrsTimeWindow.create(100, 0)).toThrow();
      expect(() => CqrsTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('CqrsPriority', () => {
    it('should create with valid value', () => {
      var p1 = CqrsPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => CqrsPriority.create(15)).toThrow();
      expect(() => CqrsPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(CqrsPriority.low().isLow()).toBe(true);
      expect(CqrsPriority.medium().isMedium()).toBe(true);
      expect(CqrsPriority.high().isHigh()).toBe(true);
      expect(CqrsPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('CqrsExecuted Event', () => {
    it('should create event', () => {
      var ev = CqrsExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = CqrsExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CqrsFailed Event', () => {
    it('should create failed event', () => {
      var ev = CqrsFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
