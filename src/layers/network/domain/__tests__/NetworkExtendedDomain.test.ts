/**
 * Extended domain tests for Network
 */

import { NetworkExecution } from '../entities/NetworkExecution';
import { NetworkConfigState as NetworkConfigEntity } from '../entities/NetworkConfigState';
import { NetworkMetricsSnapshot } from '../entities/NetworkMetricsSnapshot';
import { NetworkThreshold } from '../value-objects/NetworkThreshold';
import { NetworkTimeWindow } from '../value-objects/NetworkTimeWindow';
import { NetworkPriority } from '../value-objects/NetworkPriority';
import { NetworkExecuted } from '../events/NetworkExecuted';
import { NetworkFailed } from '../events/NetworkFailed';

describe('Extended Domain: Network', () => {
  describe('NetworkExecution', () => {
    it('should create with pending status', () => {
      var exec = NetworkExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = NetworkExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = NetworkExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = NetworkExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = NetworkExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = NetworkExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('NetworkThreshold', () => {
    it('should create within bounds', () => {
      var t = NetworkThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => NetworkThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = NetworkThreshold.create(10);
      var high = NetworkThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('NetworkTimeWindow', () => {
    it('should create from minutes', () => {
      var w = NetworkTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = NetworkTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = NetworkTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => NetworkTimeWindow.create(100, 0)).toThrow();
      expect(() => NetworkTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('NetworkPriority', () => {
    it('should create with valid value', () => {
      var p1 = NetworkPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => NetworkPriority.create(15)).toThrow();
      expect(() => NetworkPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(NetworkPriority.low().isLow()).toBe(true);
      expect(NetworkPriority.medium().isMedium()).toBe(true);
      expect(NetworkPriority.high().isHigh()).toBe(true);
      expect(NetworkPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('NetworkExecuted Event', () => {
    it('should create event', () => {
      var ev = NetworkExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = NetworkExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('NetworkFailed Event', () => {
    it('should create failed event', () => {
      var ev = NetworkFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
