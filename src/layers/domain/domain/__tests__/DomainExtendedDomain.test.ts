/**
 * Extended domain tests for Domain
 */

import { DomainExecution } from '../entities/DomainExecution';
import { DomainConfigState as DomainConfigEntity } from '../entities/DomainConfigState';
import { DomainMetrics } from '../entities/DomainMetrics';
import { DomainThreshold } from '../value-objects/DomainThreshold';
import { DomainTimeWindow } from '../value-objects/DomainTimeWindow';
import { DomainPriority } from '../value-objects/DomainPriority';
import { DomainExecuted } from '../events/DomainExecuted';
import { DomainFailed } from '../events/DomainFailed';

describe('Extended Domain: Domain', () => {
  describe('DomainExecution', () => {
    it('should create with pending status', () => {
      var exec = DomainExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DomainExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DomainExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DomainExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DomainExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DomainExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DomainThreshold', () => {
    it('should create within bounds', () => {
      var t = DomainThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DomainThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DomainThreshold.create(10);
      var high = DomainThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DomainTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DomainTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DomainTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DomainTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DomainTimeWindow.create(100, 0)).toThrow();
      expect(() => DomainTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DomainPriority', () => {
    it('should create with valid value', () => {
      var p1 = DomainPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DomainPriority.create(15)).toThrow();
      expect(() => DomainPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DomainPriority.low().isLow()).toBe(true);
      expect(DomainPriority.medium().isMedium()).toBe(true);
      expect(DomainPriority.high().isHigh()).toBe(true);
      expect(DomainPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DomainExecuted Event', () => {
    it('should create event', () => {
      var ev = DomainExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DomainExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DomainFailed Event', () => {
    it('should create failed event', () => {
      var ev = DomainFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
