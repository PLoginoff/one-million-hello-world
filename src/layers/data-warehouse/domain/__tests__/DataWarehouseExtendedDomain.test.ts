/**
 * Extended domain tests for DataWarehouse
 */

import { DataWarehouseExecution } from '../entities/DataWarehouseExecution';
import { DataWarehouseConfigState as DataWarehouseConfigEntity } from '../entities/DataWarehouseConfigState';
import { DataWarehouseMetricsSnapshot } from '../entities/DataWarehouseMetricsSnapshot';
import { DataWarehouseThreshold } from '../value-objects/DataWarehouseThreshold';
import { DataWarehouseTimeWindow } from '../value-objects/DataWarehouseTimeWindow';
import { DataWarehousePriority } from '../value-objects/DataWarehousePriority';
import { DataWarehouseExecuted } from '../events/DataWarehouseExecuted';
import { DataWarehouseFailed } from '../events/DataWarehouseFailed';

describe('Extended Domain: DataWarehouse', () => {
  describe('DataWarehouseExecution', () => {
    it('should create with pending status', () => {
      var exec = DataWarehouseExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = DataWarehouseExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = DataWarehouseExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = DataWarehouseExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = DataWarehouseExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = DataWarehouseExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('DataWarehouseThreshold', () => {
    it('should create within bounds', () => {
      var t = DataWarehouseThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => DataWarehouseThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = DataWarehouseThreshold.create(10);
      var high = DataWarehouseThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('DataWarehouseTimeWindow', () => {
    it('should create from minutes', () => {
      var w = DataWarehouseTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = DataWarehouseTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = DataWarehouseTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => DataWarehouseTimeWindow.create(100, 0)).toThrow();
      expect(() => DataWarehouseTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('DataWarehousePriority', () => {
    it('should create with valid value', () => {
      var p1 = DataWarehousePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => DataWarehousePriority.create(15)).toThrow();
      expect(() => DataWarehousePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(DataWarehousePriority.low().isLow()).toBe(true);
      expect(DataWarehousePriority.medium().isMedium()).toBe(true);
      expect(DataWarehousePriority.high().isHigh()).toBe(true);
      expect(DataWarehousePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('DataWarehouseExecuted Event', () => {
    it('should create event', () => {
      var ev = DataWarehouseExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = DataWarehouseExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('DataWarehouseFailed Event', () => {
    it('should create failed event', () => {
      var ev = DataWarehouseFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
