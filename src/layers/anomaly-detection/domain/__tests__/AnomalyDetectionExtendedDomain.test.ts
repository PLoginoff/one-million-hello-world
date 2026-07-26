/**
 * Extended domain tests for AnomalyDetection
 */

import { AnomalyDetectionExecution } from '../entities/AnomalyDetectionExecution';
import { AnomalyDetectionConfigState as AnomalyDetectionConfigEntity } from '../entities/AnomalyDetectionConfigState';
import { AnomalyDetectionMetricsSnapshot } from '../entities/AnomalyDetectionMetricsSnapshot';
import { AnomalyDetectionThreshold } from '../value-objects/AnomalyDetectionThreshold';
import { AnomalyDetectionTimeWindow } from '../value-objects/AnomalyDetectionTimeWindow';
import { AnomalyDetectionPriority } from '../value-objects/AnomalyDetectionPriority';
import { AnomalyDetectionExecuted } from '../events/AnomalyDetectionExecuted';
import { AnomalyDetectionFailed } from '../events/AnomalyDetectionFailed';

describe('Extended Domain: AnomalyDetection', () => {
  describe('AnomalyDetectionExecution', () => {
    it('should create with pending status', () => {
      var exec = AnomalyDetectionExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = AnomalyDetectionExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = AnomalyDetectionExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = AnomalyDetectionExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = AnomalyDetectionExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = AnomalyDetectionExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('AnomalyDetectionThreshold', () => {
    it('should create within bounds', () => {
      var t = AnomalyDetectionThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => AnomalyDetectionThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = AnomalyDetectionThreshold.create(10);
      var high = AnomalyDetectionThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('AnomalyDetectionTimeWindow', () => {
    it('should create from minutes', () => {
      var w = AnomalyDetectionTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = AnomalyDetectionTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = AnomalyDetectionTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => AnomalyDetectionTimeWindow.create(100, 0)).toThrow();
      expect(() => AnomalyDetectionTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('AnomalyDetectionPriority', () => {
    it('should create with valid value', () => {
      var p1 = AnomalyDetectionPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => AnomalyDetectionPriority.create(15)).toThrow();
      expect(() => AnomalyDetectionPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(AnomalyDetectionPriority.low().isLow()).toBe(true);
      expect(AnomalyDetectionPriority.medium().isMedium()).toBe(true);
      expect(AnomalyDetectionPriority.high().isHigh()).toBe(true);
      expect(AnomalyDetectionPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('AnomalyDetectionExecuted Event', () => {
    it('should create event', () => {
      var ev = AnomalyDetectionExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = AnomalyDetectionExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AnomalyDetectionFailed Event', () => {
    it('should create failed event', () => {
      var ev = AnomalyDetectionFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
