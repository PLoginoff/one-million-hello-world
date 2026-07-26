/**
 * Extended domain tests for ServiceMesh
 */

import { ServiceMeshExecution } from '../entities/ServiceMeshExecution';
import { ServiceMeshConfigState as ServiceMeshConfigEntity } from '../entities/ServiceMeshConfigState';
import { ServiceMeshMetricsSnapshot } from '../entities/ServiceMeshMetricsSnapshot';
import { ServiceMeshThreshold } from '../value-objects/ServiceMeshThreshold';
import { ServiceMeshTimeWindow } from '../value-objects/ServiceMeshTimeWindow';
import { ServiceMeshPriority } from '../value-objects/ServiceMeshPriority';
import { ServiceMeshExecuted } from '../events/ServiceMeshExecuted';
import { ServiceMeshFailed } from '../events/ServiceMeshFailed';

describe('Extended Domain: ServiceMesh', () => {
  describe('ServiceMeshExecution', () => {
    it('should create with pending status', () => {
      var exec = ServiceMeshExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ServiceMeshExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ServiceMeshExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ServiceMeshExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ServiceMeshExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ServiceMeshExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ServiceMeshThreshold', () => {
    it('should create within bounds', () => {
      var t = ServiceMeshThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ServiceMeshThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ServiceMeshThreshold.create(10);
      var high = ServiceMeshThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ServiceMeshTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ServiceMeshTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ServiceMeshTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ServiceMeshTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ServiceMeshTimeWindow.create(100, 0)).toThrow();
      expect(() => ServiceMeshTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ServiceMeshPriority', () => {
    it('should create with valid value', () => {
      var p1 = ServiceMeshPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ServiceMeshPriority.create(15)).toThrow();
      expect(() => ServiceMeshPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ServiceMeshPriority.low().isLow()).toBe(true);
      expect(ServiceMeshPriority.medium().isMedium()).toBe(true);
      expect(ServiceMeshPriority.high().isHigh()).toBe(true);
      expect(ServiceMeshPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ServiceMeshExecuted Event', () => {
    it('should create event', () => {
      var ev = ServiceMeshExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ServiceMeshExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ServiceMeshFailed Event', () => {
    it('should create failed event', () => {
      var ev = ServiceMeshFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
