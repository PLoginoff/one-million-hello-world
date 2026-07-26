/**
 * Extended domain tests for Snapshot
 */

import { SnapshotExecution } from '../entities/SnapshotExecution';
import { SnapshotConfigState as SnapshotConfigEntity } from '../entities/SnapshotConfigState';
import { SnapshotMetricsSnapshot } from '../entities/SnapshotMetricsSnapshot';
import { SnapshotThreshold } from '../value-objects/SnapshotThreshold';
import { SnapshotTimeWindow } from '../value-objects/SnapshotTimeWindow';
import { SnapshotPriority } from '../value-objects/SnapshotPriority';
import { SnapshotExecuted } from '../events/SnapshotExecuted';
import { SnapshotFailed } from '../events/SnapshotFailed';

describe('Extended Domain: Snapshot', () => {
  describe('SnapshotExecution', () => {
    it('should create with pending status', () => {
      var exec = SnapshotExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = SnapshotExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = SnapshotExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = SnapshotExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = SnapshotExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = SnapshotExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('SnapshotThreshold', () => {
    it('should create within bounds', () => {
      var t = SnapshotThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => SnapshotThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = SnapshotThreshold.create(10);
      var high = SnapshotThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('SnapshotTimeWindow', () => {
    it('should create from minutes', () => {
      var w = SnapshotTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = SnapshotTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = SnapshotTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => SnapshotTimeWindow.create(100, 0)).toThrow();
      expect(() => SnapshotTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('SnapshotPriority', () => {
    it('should create with valid value', () => {
      var p1 = SnapshotPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => SnapshotPriority.create(15)).toThrow();
      expect(() => SnapshotPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(SnapshotPriority.low().isLow()).toBe(true);
      expect(SnapshotPriority.medium().isMedium()).toBe(true);
      expect(SnapshotPriority.high().isHigh()).toBe(true);
      expect(SnapshotPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('SnapshotExecuted Event', () => {
    it('should create event', () => {
      var ev = SnapshotExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = SnapshotExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SnapshotFailed Event', () => {
    it('should create failed event', () => {
      var ev = SnapshotFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
