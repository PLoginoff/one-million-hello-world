/**
 * Extended domain tests for ChaosEngineering
 */

import { ChaosEngineeringExecution } from '../entities/ChaosEngineeringExecution';
import { ChaosEngineeringConfigState as ChaosEngineeringConfigEntity } from '../entities/ChaosEngineeringConfigState';
import { ChaosEngineeringMetricsSnapshot } from '../entities/ChaosEngineeringMetricsSnapshot';
import { ChaosEngineeringThreshold } from '../value-objects/ChaosEngineeringThreshold';
import { ChaosEngineeringTimeWindow } from '../value-objects/ChaosEngineeringTimeWindow';
import { ChaosEngineeringPriority } from '../value-objects/ChaosEngineeringPriority';
import { ChaosEngineeringExecuted } from '../events/ChaosEngineeringExecuted';
import { ChaosEngineeringFailed } from '../events/ChaosEngineeringFailed';

describe('Extended Domain: ChaosEngineering', () => {
  describe('ChaosEngineeringExecution', () => {
    it('should create with pending status', () => {
      var exec = ChaosEngineeringExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ChaosEngineeringExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ChaosEngineeringExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ChaosEngineeringExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ChaosEngineeringExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ChaosEngineeringExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ChaosEngineeringThreshold', () => {
    it('should create within bounds', () => {
      var t = ChaosEngineeringThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ChaosEngineeringThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ChaosEngineeringThreshold.create(10);
      var high = ChaosEngineeringThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ChaosEngineeringTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ChaosEngineeringTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ChaosEngineeringTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ChaosEngineeringTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ChaosEngineeringTimeWindow.create(100, 0)).toThrow();
      expect(() => ChaosEngineeringTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ChaosEngineeringPriority', () => {
    it('should create with valid value', () => {
      var p1 = ChaosEngineeringPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ChaosEngineeringPriority.create(15)).toThrow();
      expect(() => ChaosEngineeringPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ChaosEngineeringPriority.low().isLow()).toBe(true);
      expect(ChaosEngineeringPriority.medium().isMedium()).toBe(true);
      expect(ChaosEngineeringPriority.high().isHigh()).toBe(true);
      expect(ChaosEngineeringPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ChaosEngineeringExecuted Event', () => {
    it('should create event', () => {
      var ev = ChaosEngineeringExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ChaosEngineeringExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ChaosEngineeringFailed Event', () => {
    it('should create failed event', () => {
      var ev = ChaosEngineeringFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
