/**
 * Extended domain tests for LoadBalancer
 */

import { LoadBalancerExecution } from '../entities/LoadBalancerExecution';
import { LoadBalancerConfigState as LoadBalancerConfigEntity } from '../entities/LoadBalancerConfigState';
import { LoadBalancerMetricsSnapshot } from '../entities/LoadBalancerMetricsSnapshot';
import { LoadBalancerThreshold } from '../value-objects/LoadBalancerThreshold';
import { LoadBalancerTimeWindow } from '../value-objects/LoadBalancerTimeWindow';
import { LoadBalancerPriority } from '../value-objects/LoadBalancerPriority';
import { LoadBalancerExecuted } from '../events/LoadBalancerExecuted';
import { LoadBalancerFailed } from '../events/LoadBalancerFailed';

describe('Extended Domain: LoadBalancer', () => {
  describe('LoadBalancerExecution', () => {
    it('should create with pending status', () => {
      var exec = LoadBalancerExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = LoadBalancerExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = LoadBalancerExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = LoadBalancerExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = LoadBalancerExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = LoadBalancerExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('LoadBalancerThreshold', () => {
    it('should create within bounds', () => {
      var t = LoadBalancerThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => LoadBalancerThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = LoadBalancerThreshold.create(10);
      var high = LoadBalancerThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('LoadBalancerTimeWindow', () => {
    it('should create from minutes', () => {
      var w = LoadBalancerTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = LoadBalancerTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = LoadBalancerTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => LoadBalancerTimeWindow.create(100, 0)).toThrow();
      expect(() => LoadBalancerTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('LoadBalancerPriority', () => {
    it('should create with valid value', () => {
      var p1 = LoadBalancerPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => LoadBalancerPriority.create(15)).toThrow();
      expect(() => LoadBalancerPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(LoadBalancerPriority.low().isLow()).toBe(true);
      expect(LoadBalancerPriority.medium().isMedium()).toBe(true);
      expect(LoadBalancerPriority.high().isHigh()).toBe(true);
      expect(LoadBalancerPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('LoadBalancerExecuted Event', () => {
    it('should create event', () => {
      var ev = LoadBalancerExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = LoadBalancerExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('LoadBalancerFailed Event', () => {
    it('should create failed event', () => {
      var ev = LoadBalancerFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
