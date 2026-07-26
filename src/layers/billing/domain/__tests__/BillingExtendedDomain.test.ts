/**
 * Extended domain tests for Billing
 */

import { BillingExecution } from '../entities/BillingExecution';
import { BillingConfigState as BillingConfigEntity } from '../entities/BillingConfigState';
import { BillingMetricsSnapshot } from '../entities/BillingMetricsSnapshot';
import { BillingThreshold } from '../value-objects/BillingThreshold';
import { BillingTimeWindow } from '../value-objects/BillingTimeWindow';
import { BillingPriority } from '../value-objects/BillingPriority';
import { BillingExecuted } from '../events/BillingExecuted';
import { BillingFailed } from '../events/BillingFailed';

describe('Extended Domain: Billing', () => {
  describe('BillingExecution', () => {
    it('should create with pending status', () => {
      var exec = BillingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = BillingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = BillingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = BillingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = BillingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = BillingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('BillingThreshold', () => {
    it('should create within bounds', () => {
      var t = BillingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => BillingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = BillingThreshold.create(10);
      var high = BillingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('BillingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = BillingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = BillingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = BillingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => BillingTimeWindow.create(100, 0)).toThrow();
      expect(() => BillingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('BillingPriority', () => {
    it('should create with valid value', () => {
      var p1 = BillingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => BillingPriority.create(15)).toThrow();
      expect(() => BillingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(BillingPriority.low().isLow()).toBe(true);
      expect(BillingPriority.medium().isMedium()).toBe(true);
      expect(BillingPriority.high().isHigh()).toBe(true);
      expect(BillingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('BillingExecuted Event', () => {
    it('should create event', () => {
      var ev = BillingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = BillingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BillingFailed Event', () => {
    it('should create failed event', () => {
      var ev = BillingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
