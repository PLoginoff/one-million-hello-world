/**
 * Extended domain tests for MultiTenancy
 */

import { MultiTenancyExecution } from '../entities/MultiTenancyExecution';
import { MultiTenancyConfigState as MultiTenancyConfigEntity } from '../entities/MultiTenancyConfigState';
import { MultiTenancyMetricsSnapshot } from '../entities/MultiTenancyMetricsSnapshot';
import { MultiTenancyThreshold } from '../value-objects/MultiTenancyThreshold';
import { MultiTenancyTimeWindow } from '../value-objects/MultiTenancyTimeWindow';
import { MultiTenancyPriority } from '../value-objects/MultiTenancyPriority';
import { MultiTenancyExecuted } from '../events/MultiTenancyExecuted';
import { MultiTenancyFailed } from '../events/MultiTenancyFailed';

describe('Extended Domain: MultiTenancy', () => {
  describe('MultiTenancyExecution', () => {
    it('should create with pending status', () => {
      var exec = MultiTenancyExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MultiTenancyExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MultiTenancyExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MultiTenancyExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MultiTenancyExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MultiTenancyExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MultiTenancyThreshold', () => {
    it('should create within bounds', () => {
      var t = MultiTenancyThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MultiTenancyThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MultiTenancyThreshold.create(10);
      var high = MultiTenancyThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MultiTenancyTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MultiTenancyTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MultiTenancyTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MultiTenancyTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MultiTenancyTimeWindow.create(100, 0)).toThrow();
      expect(() => MultiTenancyTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MultiTenancyPriority', () => {
    it('should create with valid value', () => {
      var p1 = MultiTenancyPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MultiTenancyPriority.create(15)).toThrow();
      expect(() => MultiTenancyPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MultiTenancyPriority.low().isLow()).toBe(true);
      expect(MultiTenancyPriority.medium().isMedium()).toBe(true);
      expect(MultiTenancyPriority.high().isHigh()).toBe(true);
      expect(MultiTenancyPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MultiTenancyExecuted Event', () => {
    it('should create event', () => {
      var ev = MultiTenancyExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MultiTenancyExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MultiTenancyFailed Event', () => {
    it('should create failed event', () => {
      var ev = MultiTenancyFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
