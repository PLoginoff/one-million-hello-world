/**
 * Extended domain tests for Recommendation
 */

import { RecommendationExecution } from '../entities/RecommendationExecution';
import { RecommendationConfigState as RecommendationConfigEntity } from '../entities/RecommendationConfigState';
import { RecommendationMetricsSnapshot } from '../entities/RecommendationMetricsSnapshot';
import { RecommendationThreshold } from '../value-objects/RecommendationThreshold';
import { RecommendationTimeWindow } from '../value-objects/RecommendationTimeWindow';
import { RecommendationPriority } from '../value-objects/RecommendationPriority';
import { RecommendationExecuted } from '../events/RecommendationExecuted';
import { RecommendationFailed } from '../events/RecommendationFailed';

describe('Extended Domain: Recommendation', () => {
  describe('RecommendationExecution', () => {
    it('should create with pending status', () => {
      var exec = RecommendationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = RecommendationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = RecommendationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = RecommendationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = RecommendationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = RecommendationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('RecommendationThreshold', () => {
    it('should create within bounds', () => {
      var t = RecommendationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => RecommendationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = RecommendationThreshold.create(10);
      var high = RecommendationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('RecommendationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = RecommendationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = RecommendationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = RecommendationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => RecommendationTimeWindow.create(100, 0)).toThrow();
      expect(() => RecommendationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('RecommendationPriority', () => {
    it('should create with valid value', () => {
      var p1 = RecommendationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => RecommendationPriority.create(15)).toThrow();
      expect(() => RecommendationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(RecommendationPriority.low().isLow()).toBe(true);
      expect(RecommendationPriority.medium().isMedium()).toBe(true);
      expect(RecommendationPriority.high().isHigh()).toBe(true);
      expect(RecommendationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('RecommendationExecuted Event', () => {
    it('should create event', () => {
      var ev = RecommendationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = RecommendationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RecommendationFailed Event', () => {
    it('should create failed event', () => {
      var ev = RecommendationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
