/**
 * Extended domain tests for Backup
 */

import { BackupExecution } from '../entities/BackupExecution';
import { BackupConfigState as BackupConfigEntity } from '../entities/BackupConfigState';
import { BackupMetricsSnapshot } from '../entities/BackupMetricsSnapshot';
import { BackupThreshold } from '../value-objects/BackupThreshold';
import { BackupTimeWindow } from '../value-objects/BackupTimeWindow';
import { BackupPriority } from '../value-objects/BackupPriority';
import { BackupExecuted } from '../events/BackupExecuted';
import { BackupFailed } from '../events/BackupFailed';

describe('Extended Domain: Backup', () => {
  describe('BackupExecution', () => {
    it('should create with pending status', () => {
      var exec = BackupExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = BackupExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = BackupExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = BackupExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = BackupExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = BackupExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('BackupThreshold', () => {
    it('should create within bounds', () => {
      var t = BackupThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => BackupThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = BackupThreshold.create(10);
      var high = BackupThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('BackupTimeWindow', () => {
    it('should create from minutes', () => {
      var w = BackupTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = BackupTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = BackupTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => BackupTimeWindow.create(100, 0)).toThrow();
      expect(() => BackupTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('BackupPriority', () => {
    it('should create with valid value', () => {
      var p1 = BackupPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => BackupPriority.create(15)).toThrow();
      expect(() => BackupPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(BackupPriority.low().isLow()).toBe(true);
      expect(BackupPriority.medium().isMedium()).toBe(true);
      expect(BackupPriority.high().isHigh()).toBe(true);
      expect(BackupPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('BackupExecuted Event', () => {
    it('should create event', () => {
      var ev = BackupExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = BackupExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BackupFailed Event', () => {
    it('should create failed event', () => {
      var ev = BackupFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
