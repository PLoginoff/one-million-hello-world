/**
 * Extended domain tests for Reporting
 */

import { ReportingExecution } from '../entities/ReportingExecution';
import { ReportingConfigState as ReportingConfigEntity } from '../entities/ReportingConfigState';
import { ReportingMetricsSnapshot } from '../entities/ReportingMetricsSnapshot';
import { ReportingThreshold } from '../value-objects/ReportingThreshold';
import { ReportingTimeWindow } from '../value-objects/ReportingTimeWindow';
import { ReportingPriority } from '../value-objects/ReportingPriority';
import { ReportingExecuted } from '../events/ReportingExecuted';
import { ReportingFailed } from '../events/ReportingFailed';

describe('Extended Domain: Reporting', () => {
  describe('ReportingExecution', () => {
    it('should create with pending status', () => {
      var exec = ReportingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ReportingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ReportingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ReportingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ReportingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ReportingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ReportingThreshold', () => {
    it('should create within bounds', () => {
      var t = ReportingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ReportingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ReportingThreshold.create(10);
      var high = ReportingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ReportingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ReportingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ReportingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ReportingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ReportingTimeWindow.create(100, 0)).toThrow();
      expect(() => ReportingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ReportingPriority', () => {
    it('should create with valid value', () => {
      var p1 = ReportingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ReportingPriority.create(15)).toThrow();
      expect(() => ReportingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ReportingPriority.low().isLow()).toBe(true);
      expect(ReportingPriority.medium().isMedium()).toBe(true);
      expect(ReportingPriority.high().isHigh()).toBe(true);
      expect(ReportingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ReportingExecuted Event', () => {
    it('should create event', () => {
      var ev = ReportingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ReportingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ReportingFailed Event', () => {
    it('should create failed event', () => {
      var ev = ReportingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
