/**
 * Extended domain tests for ServiceDiscovery
 */

import { ServiceDiscoveryExecution } from '../entities/ServiceDiscoveryExecution';
import { ServiceDiscoveryConfigState as ServiceDiscoveryConfigEntity } from '../entities/ServiceDiscoveryConfigState';
import { ServiceDiscoveryMetricsSnapshot } from '../entities/ServiceDiscoveryMetricsSnapshot';
import { ServiceDiscoveryThreshold } from '../value-objects/ServiceDiscoveryThreshold';
import { ServiceDiscoveryTimeWindow } from '../value-objects/ServiceDiscoveryTimeWindow';
import { ServiceDiscoveryPriority } from '../value-objects/ServiceDiscoveryPriority';
import { ServiceDiscoveryExecuted } from '../events/ServiceDiscoveryExecuted';
import { ServiceDiscoveryFailed } from '../events/ServiceDiscoveryFailed';

describe('Extended Domain: ServiceDiscovery', () => {
  describe('ServiceDiscoveryExecution', () => {
    it('should create with pending status', () => {
      var exec = ServiceDiscoveryExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ServiceDiscoveryExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ServiceDiscoveryExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ServiceDiscoveryExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ServiceDiscoveryExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ServiceDiscoveryExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ServiceDiscoveryThreshold', () => {
    it('should create within bounds', () => {
      var t = ServiceDiscoveryThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ServiceDiscoveryThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ServiceDiscoveryThreshold.create(10);
      var high = ServiceDiscoveryThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ServiceDiscoveryTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ServiceDiscoveryTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ServiceDiscoveryTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ServiceDiscoveryTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ServiceDiscoveryTimeWindow.create(100, 0)).toThrow();
      expect(() => ServiceDiscoveryTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ServiceDiscoveryPriority', () => {
    it('should create with valid value', () => {
      var p1 = ServiceDiscoveryPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ServiceDiscoveryPriority.create(15)).toThrow();
      expect(() => ServiceDiscoveryPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ServiceDiscoveryPriority.low().isLow()).toBe(true);
      expect(ServiceDiscoveryPriority.medium().isMedium()).toBe(true);
      expect(ServiceDiscoveryPriority.high().isHigh()).toBe(true);
      expect(ServiceDiscoveryPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ServiceDiscoveryExecuted Event', () => {
    it('should create event', () => {
      var ev = ServiceDiscoveryExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ServiceDiscoveryExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ServiceDiscoveryFailed Event', () => {
    it('should create failed event', () => {
      var ev = ServiceDiscoveryFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
