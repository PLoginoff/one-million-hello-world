/**
 * Extended domain tests for Onboarding
 */

import { OnboardingExecution } from '../entities/OnboardingExecution';
import { OnboardingConfigState as OnboardingConfigEntity } from '../entities/OnboardingConfigState';
import { OnboardingMetricsSnapshot } from '../entities/OnboardingMetricsSnapshot';
import { OnboardingThreshold } from '../value-objects/OnboardingThreshold';
import { OnboardingTimeWindow } from '../value-objects/OnboardingTimeWindow';
import { OnboardingPriority } from '../value-objects/OnboardingPriority';
import { OnboardingExecuted } from '../events/OnboardingExecuted';
import { OnboardingFailed } from '../events/OnboardingFailed';

describe('Extended Domain: Onboarding', () => {
  describe('OnboardingExecution', () => {
    it('should create with pending status', () => {
      var exec = OnboardingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = OnboardingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = OnboardingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = OnboardingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = OnboardingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = OnboardingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('OnboardingThreshold', () => {
    it('should create within bounds', () => {
      var t = OnboardingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => OnboardingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = OnboardingThreshold.create(10);
      var high = OnboardingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('OnboardingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = OnboardingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = OnboardingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = OnboardingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => OnboardingTimeWindow.create(100, 0)).toThrow();
      expect(() => OnboardingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('OnboardingPriority', () => {
    it('should create with valid value', () => {
      var p1 = OnboardingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => OnboardingPriority.create(15)).toThrow();
      expect(() => OnboardingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(OnboardingPriority.low().isLow()).toBe(true);
      expect(OnboardingPriority.medium().isMedium()).toBe(true);
      expect(OnboardingPriority.high().isHigh()).toBe(true);
      expect(OnboardingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('OnboardingExecuted Event', () => {
    it('should create event', () => {
      var ev = OnboardingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = OnboardingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('OnboardingFailed Event', () => {
    it('should create failed event', () => {
      var ev = OnboardingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
