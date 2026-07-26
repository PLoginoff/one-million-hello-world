/**
 * Extended domain tests for Outbox
 */

import { OutboxExecution } from '../entities/OutboxExecution';
import { OutboxConfigState as OutboxConfigEntity } from '../entities/OutboxConfigState';
import { OutboxMetricsSnapshot } from '../entities/OutboxMetricsSnapshot';
import { OutboxThreshold } from '../value-objects/OutboxThreshold';
import { OutboxTimeWindow } from '../value-objects/OutboxTimeWindow';
import { OutboxPriority } from '../value-objects/OutboxPriority';
import { OutboxExecuted } from '../events/OutboxExecuted';
import { OutboxFailed } from '../events/OutboxFailed';

describe('Extended Domain: Outbox', () => {
  describe('OutboxExecution', () => {
    it('should create with pending status', () => {
      var exec = OutboxExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = OutboxExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = OutboxExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = OutboxExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = OutboxExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = OutboxExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('OutboxThreshold', () => {
    it('should create within bounds', () => {
      var t = OutboxThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => OutboxThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = OutboxThreshold.create(10);
      var high = OutboxThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('OutboxTimeWindow', () => {
    it('should create from minutes', () => {
      var w = OutboxTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = OutboxTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = OutboxTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => OutboxTimeWindow.create(100, 0)).toThrow();
      expect(() => OutboxTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('OutboxPriority', () => {
    it('should create with valid value', () => {
      var p1 = OutboxPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => OutboxPriority.create(15)).toThrow();
      expect(() => OutboxPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(OutboxPriority.low().isLow()).toBe(true);
      expect(OutboxPriority.medium().isMedium()).toBe(true);
      expect(OutboxPriority.high().isHigh()).toBe(true);
      expect(OutboxPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('OutboxExecuted Event', () => {
    it('should create event', () => {
      var ev = OutboxExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = OutboxExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('OutboxFailed Event', () => {
    it('should create failed event', () => {
      var ev = OutboxFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
