/**
 * Extended domain tests for Inbox
 */

import { InboxExecution } from '../entities/InboxExecution';
import { InboxConfigState as InboxConfigEntity } from '../entities/InboxConfigState';
import { InboxMetricsSnapshot } from '../entities/InboxMetricsSnapshot';
import { InboxThreshold } from '../value-objects/InboxThreshold';
import { InboxTimeWindow } from '../value-objects/InboxTimeWindow';
import { InboxPriority } from '../value-objects/InboxPriority';
import { InboxExecuted } from '../events/InboxExecuted';
import { InboxFailed } from '../events/InboxFailed';

describe('Extended Domain: Inbox', () => {
  describe('InboxExecution', () => {
    it('should create with pending status', () => {
      var exec = InboxExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = InboxExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = InboxExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = InboxExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = InboxExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = InboxExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('InboxThreshold', () => {
    it('should create within bounds', () => {
      var t = InboxThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => InboxThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = InboxThreshold.create(10);
      var high = InboxThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('InboxTimeWindow', () => {
    it('should create from minutes', () => {
      var w = InboxTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = InboxTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = InboxTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => InboxTimeWindow.create(100, 0)).toThrow();
      expect(() => InboxTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('InboxPriority', () => {
    it('should create with valid value', () => {
      var p1 = InboxPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => InboxPriority.create(15)).toThrow();
      expect(() => InboxPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(InboxPriority.low().isLow()).toBe(true);
      expect(InboxPriority.medium().isMedium()).toBe(true);
      expect(InboxPriority.high().isHigh()).toBe(true);
      expect(InboxPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('InboxExecuted Event', () => {
    it('should create event', () => {
      var ev = InboxExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = InboxExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('InboxFailed Event', () => {
    it('should create failed event', () => {
      var ev = InboxFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
