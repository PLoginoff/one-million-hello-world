/**
 * Extended domain tests for StreamProcessing
 */

import { StreamProcessingExecution } from '../entities/StreamProcessingExecution';
import { StreamProcessingConfigState as StreamProcessingConfigEntity } from '../entities/StreamProcessingConfigState';
import { StreamProcessingMetricsSnapshot } from '../entities/StreamProcessingMetricsSnapshot';
import { StreamProcessingThreshold } from '../value-objects/StreamProcessingThreshold';
import { StreamProcessingTimeWindow } from '../value-objects/StreamProcessingTimeWindow';
import { StreamProcessingPriority } from '../value-objects/StreamProcessingPriority';
import { StreamProcessingExecuted } from '../events/StreamProcessingExecuted';
import { StreamProcessingFailed } from '../events/StreamProcessingFailed';

describe('Extended Domain: StreamProcessing', () => {
  describe('StreamProcessingExecution', () => {
    it('should create with pending status', () => {
      var exec = StreamProcessingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = StreamProcessingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = StreamProcessingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = StreamProcessingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = StreamProcessingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = StreamProcessingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('StreamProcessingThreshold', () => {
    it('should create within bounds', () => {
      var t = StreamProcessingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => StreamProcessingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = StreamProcessingThreshold.create(10);
      var high = StreamProcessingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('StreamProcessingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = StreamProcessingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = StreamProcessingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = StreamProcessingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => StreamProcessingTimeWindow.create(100, 0)).toThrow();
      expect(() => StreamProcessingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('StreamProcessingPriority', () => {
    it('should create with valid value', () => {
      var p1 = StreamProcessingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => StreamProcessingPriority.create(15)).toThrow();
      expect(() => StreamProcessingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(StreamProcessingPriority.low().isLow()).toBe(true);
      expect(StreamProcessingPriority.medium().isMedium()).toBe(true);
      expect(StreamProcessingPriority.high().isHigh()).toBe(true);
      expect(StreamProcessingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('StreamProcessingExecuted Event', () => {
    it('should create event', () => {
      var ev = StreamProcessingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = StreamProcessingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('StreamProcessingFailed Event', () => {
    it('should create failed event', () => {
      var ev = StreamProcessingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
