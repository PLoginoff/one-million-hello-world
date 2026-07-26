/**
 * Extended domain tests for Migrations
 */

import { MigrationsExecution } from '../entities/MigrationsExecution';
import { MigrationsConfigState as MigrationsConfigEntity } from '../entities/MigrationsConfigState';
import { MigrationsMetricsSnapshot } from '../entities/MigrationsMetricsSnapshot';
import { MigrationsThreshold } from '../value-objects/MigrationsThreshold';
import { MigrationsTimeWindow } from '../value-objects/MigrationsTimeWindow';
import { MigrationsPriority } from '../value-objects/MigrationsPriority';
import { MigrationsExecuted } from '../events/MigrationsExecuted';
import { MigrationsFailed } from '../events/MigrationsFailed';

describe('Extended Domain: Migrations', () => {
  describe('MigrationsExecution', () => {
    it('should create with pending status', () => {
      var exec = MigrationsExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MigrationsExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MigrationsExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MigrationsExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MigrationsExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MigrationsExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MigrationsThreshold', () => {
    it('should create within bounds', () => {
      var t = MigrationsThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MigrationsThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MigrationsThreshold.create(10);
      var high = MigrationsThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MigrationsTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MigrationsTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MigrationsTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MigrationsTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MigrationsTimeWindow.create(100, 0)).toThrow();
      expect(() => MigrationsTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MigrationsPriority', () => {
    it('should create with valid value', () => {
      var p1 = MigrationsPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MigrationsPriority.create(15)).toThrow();
      expect(() => MigrationsPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MigrationsPriority.low().isLow()).toBe(true);
      expect(MigrationsPriority.medium().isMedium()).toBe(true);
      expect(MigrationsPriority.high().isHigh()).toBe(true);
      expect(MigrationsPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MigrationsExecuted Event', () => {
    it('should create event', () => {
      var ev = MigrationsExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MigrationsExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MigrationsFailed Event', () => {
    it('should create failed event', () => {
      var ev = MigrationsFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
