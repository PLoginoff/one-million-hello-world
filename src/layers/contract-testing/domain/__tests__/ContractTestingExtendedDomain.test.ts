/**
 * Extended domain tests for ContractTesting
 */

import { ContractTestingExecution } from '../entities/ContractTestingExecution';
import { ContractTestingConfigState as ContractTestingConfigEntity } from '../entities/ContractTestingConfigState';
import { ContractTestingMetricsSnapshot } from '../entities/ContractTestingMetricsSnapshot';
import { ContractTestingThreshold } from '../value-objects/ContractTestingThreshold';
import { ContractTestingTimeWindow } from '../value-objects/ContractTestingTimeWindow';
import { ContractTestingPriority } from '../value-objects/ContractTestingPriority';
import { ContractTestingExecuted } from '../events/ContractTestingExecuted';
import { ContractTestingFailed } from '../events/ContractTestingFailed';

describe('Extended Domain: ContractTesting', () => {
  describe('ContractTestingExecution', () => {
    it('should create with pending status', () => {
      var exec = ContractTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ContractTestingExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ContractTestingExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ContractTestingExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ContractTestingExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ContractTestingExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ContractTestingThreshold', () => {
    it('should create within bounds', () => {
      var t = ContractTestingThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ContractTestingThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ContractTestingThreshold.create(10);
      var high = ContractTestingThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ContractTestingTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ContractTestingTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ContractTestingTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ContractTestingTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ContractTestingTimeWindow.create(100, 0)).toThrow();
      expect(() => ContractTestingTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ContractTestingPriority', () => {
    it('should create with valid value', () => {
      var p1 = ContractTestingPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ContractTestingPriority.create(15)).toThrow();
      expect(() => ContractTestingPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ContractTestingPriority.low().isLow()).toBe(true);
      expect(ContractTestingPriority.medium().isMedium()).toBe(true);
      expect(ContractTestingPriority.high().isHigh()).toBe(true);
      expect(ContractTestingPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ContractTestingExecuted Event', () => {
    it('should create event', () => {
      var ev = ContractTestingExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ContractTestingExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ContractTestingFailed Event', () => {
    it('should create failed event', () => {
      var ev = ContractTestingFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
