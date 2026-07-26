/**
 * Extended domain tests for FraudDetection
 */

import { FraudDetectionExecution } from '../entities/FraudDetectionExecution';
import { FraudDetectionConfigState as FraudDetectionConfigEntity } from '../entities/FraudDetectionConfigState';
import { FraudDetectionMetricsSnapshot } from '../entities/FraudDetectionMetricsSnapshot';
import { FraudDetectionThreshold } from '../value-objects/FraudDetectionThreshold';
import { FraudDetectionTimeWindow } from '../value-objects/FraudDetectionTimeWindow';
import { FraudDetectionPriority } from '../value-objects/FraudDetectionPriority';
import { FraudDetectionExecuted } from '../events/FraudDetectionExecuted';
import { FraudDetectionFailed } from '../events/FraudDetectionFailed';

describe('Extended Domain: FraudDetection', () => {
  describe('FraudDetectionExecution', () => {
    it('should create with pending status', () => {
      var exec = FraudDetectionExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = FraudDetectionExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = FraudDetectionExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = FraudDetectionExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = FraudDetectionExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = FraudDetectionExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('FraudDetectionThreshold', () => {
    it('should create within bounds', () => {
      var t = FraudDetectionThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => FraudDetectionThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = FraudDetectionThreshold.create(10);
      var high = FraudDetectionThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('FraudDetectionTimeWindow', () => {
    it('should create from minutes', () => {
      var w = FraudDetectionTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = FraudDetectionTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = FraudDetectionTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => FraudDetectionTimeWindow.create(100, 0)).toThrow();
      expect(() => FraudDetectionTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('FraudDetectionPriority', () => {
    it('should create with valid value', () => {
      var p1 = FraudDetectionPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => FraudDetectionPriority.create(15)).toThrow();
      expect(() => FraudDetectionPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(FraudDetectionPriority.low().isLow()).toBe(true);
      expect(FraudDetectionPriority.medium().isMedium()).toBe(true);
      expect(FraudDetectionPriority.high().isHigh()).toBe(true);
      expect(FraudDetectionPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('FraudDetectionExecuted Event', () => {
    it('should create event', () => {
      var ev = FraudDetectionExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = FraudDetectionExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('FraudDetectionFailed Event', () => {
    it('should create failed event', () => {
      var ev = FraudDetectionFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
