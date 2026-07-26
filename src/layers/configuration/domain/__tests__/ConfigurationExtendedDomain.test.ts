/**
 * Extended domain tests for Configuration
 */

import { ConfigurationExecution } from '../entities/ConfigurationExecution';
import { ConfigurationConfigState as ConfigurationConfigEntity } from '../entities/ConfigurationConfigState';
import { ConfigurationMetricsSnapshot } from '../entities/ConfigurationMetricsSnapshot';
import { ConfigurationThreshold } from '../value-objects/ConfigurationThreshold';
import { ConfigurationTimeWindow } from '../value-objects/ConfigurationTimeWindow';
import { ConfigurationPriority } from '../value-objects/ConfigurationPriority';
import { ConfigurationExecuted } from '../events/ConfigurationExecuted';
import { ConfigurationFailed } from '../events/ConfigurationFailed';

describe('Extended Domain: Configuration', () => {
  describe('ConfigurationExecution', () => {
    it('should create with pending status', () => {
      var exec = ConfigurationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ConfigurationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ConfigurationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ConfigurationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ConfigurationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ConfigurationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ConfigurationThreshold', () => {
    it('should create within bounds', () => {
      var t = ConfigurationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ConfigurationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ConfigurationThreshold.create(10);
      var high = ConfigurationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ConfigurationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ConfigurationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ConfigurationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ConfigurationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ConfigurationTimeWindow.create(100, 0)).toThrow();
      expect(() => ConfigurationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ConfigurationPriority', () => {
    it('should create with valid value', () => {
      var p1 = ConfigurationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ConfigurationPriority.create(15)).toThrow();
      expect(() => ConfigurationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ConfigurationPriority.low().isLow()).toBe(true);
      expect(ConfigurationPriority.medium().isMedium()).toBe(true);
      expect(ConfigurationPriority.high().isHigh()).toBe(true);
      expect(ConfigurationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ConfigurationExecuted Event', () => {
    it('should create event', () => {
      var ev = ConfigurationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ConfigurationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ConfigurationFailed Event', () => {
    it('should create failed event', () => {
      var ev = ConfigurationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
