/**
 * Extended domain tests for Repository
 */

import { RepositoryExecution } from '../entities/RepositoryExecution';
import { RepositoryConfigState as RepositoryConfigEntity } from '../entities/RepositoryConfigState';
import { RepositoryMetrics } from '../entities/RepositoryMetrics';
import { RepositoryThreshold } from '../value-objects/RepositoryThreshold';
import { RepositoryTimeWindow } from '../value-objects/RepositoryTimeWindow';
import { RepositoryPriority } from '../value-objects/RepositoryPriority';
import { RepositoryExecuted } from '../events/RepositoryExecuted';
import { RepositoryFailed } from '../events/RepositoryFailed';

describe('Extended Domain: Repository', () => {
  describe('RepositoryExecution', () => {
    it('should create with pending status', () => {
      var exec = RepositoryExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = RepositoryExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = RepositoryExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = RepositoryExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = RepositoryExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = RepositoryExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('RepositoryThreshold', () => {
    it('should create within bounds', () => {
      var t = RepositoryThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => RepositoryThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = RepositoryThreshold.create(10);
      var high = RepositoryThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('RepositoryTimeWindow', () => {
    it('should create from minutes', () => {
      var w = RepositoryTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = RepositoryTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = RepositoryTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => RepositoryTimeWindow.create(100, 0)).toThrow();
      expect(() => RepositoryTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('RepositoryPriority', () => {
    it('should create with valid value', () => {
      var p1 = RepositoryPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => RepositoryPriority.create(15)).toThrow();
      expect(() => RepositoryPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(RepositoryPriority.low().isLow()).toBe(true);
      expect(RepositoryPriority.medium().isMedium()).toBe(true);
      expect(RepositoryPriority.high().isHigh()).toBe(true);
      expect(RepositoryPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('RepositoryExecuted Event', () => {
    it('should create event', () => {
      var ev = RepositoryExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = RepositoryExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RepositoryFailed Event', () => {
    it('should create failed event', () => {
      var ev = RepositoryFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
