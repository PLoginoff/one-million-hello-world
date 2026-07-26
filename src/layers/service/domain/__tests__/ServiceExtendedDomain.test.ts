/**
 * Extended domain tests for Service
 */

import { ServiceExecution } from '../entities/ServiceExecution';
import { ServiceConfigState as ServiceConfigEntity } from '../entities/ServiceConfigState';
import { ServiceMetrics } from '../entities/ServiceMetrics';
import { ServiceThreshold } from '../value-objects/ServiceThreshold';
import { ServiceTimeWindow } from '../value-objects/ServiceTimeWindow';
import { ServicePriority } from '../value-objects/ServicePriority';
import { ServiceExecuted } from '../events/ServiceExecuted';
import { ServiceFailed } from '../events/ServiceFailed';

describe('Extended Domain: Service', () => {
  describe('ServiceExecution', () => {
    it('should create with pending status', () => {
      var exec = ServiceExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ServiceExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ServiceExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ServiceExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ServiceExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ServiceExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ServiceThreshold', () => {
    it('should create within bounds', () => {
      var t = ServiceThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ServiceThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ServiceThreshold.create(10);
      var high = ServiceThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ServiceTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ServiceTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ServiceTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ServiceTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ServiceTimeWindow.create(100, 0)).toThrow();
      expect(() => ServiceTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ServicePriority', () => {
    it('should create with valid value', () => {
      var p1 = ServicePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ServicePriority.create(15)).toThrow();
      expect(() => ServicePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ServicePriority.low().isLow()).toBe(true);
      expect(ServicePriority.medium().isMedium()).toBe(true);
      expect(ServicePriority.high().isHigh()).toBe(true);
      expect(ServicePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ServiceExecuted Event', () => {
    it('should create event', () => {
      var ev = ServiceExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ServiceExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ServiceFailed Event', () => {
    it('should create failed event', () => {
      var ev = ServiceFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
