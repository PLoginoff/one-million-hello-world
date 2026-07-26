/**
 * Extended domain tests for CdnIntegration
 */

import { CdnIntegrationExecution } from '../entities/CdnIntegrationExecution';
import { CdnIntegrationConfigState as CdnIntegrationConfigEntity } from '../entities/CdnIntegrationConfigState';
import { CdnIntegrationMetricsSnapshot } from '../entities/CdnIntegrationMetricsSnapshot';
import { CdnIntegrationThreshold } from '../value-objects/CdnIntegrationThreshold';
import { CdnIntegrationTimeWindow } from '../value-objects/CdnIntegrationTimeWindow';
import { CdnIntegrationPriority } from '../value-objects/CdnIntegrationPriority';
import { CdnIntegrationExecuted } from '../events/CdnIntegrationExecuted';
import { CdnIntegrationFailed } from '../events/CdnIntegrationFailed';

describe('Extended Domain: CdnIntegration', () => {
  describe('CdnIntegrationExecution', () => {
    it('should create with pending status', () => {
      var exec = CdnIntegrationExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = CdnIntegrationExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = CdnIntegrationExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = CdnIntegrationExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = CdnIntegrationExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = CdnIntegrationExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('CdnIntegrationThreshold', () => {
    it('should create within bounds', () => {
      var t = CdnIntegrationThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => CdnIntegrationThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = CdnIntegrationThreshold.create(10);
      var high = CdnIntegrationThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('CdnIntegrationTimeWindow', () => {
    it('should create from minutes', () => {
      var w = CdnIntegrationTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = CdnIntegrationTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = CdnIntegrationTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => CdnIntegrationTimeWindow.create(100, 0)).toThrow();
      expect(() => CdnIntegrationTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('CdnIntegrationPriority', () => {
    it('should create with valid value', () => {
      var p1 = CdnIntegrationPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => CdnIntegrationPriority.create(15)).toThrow();
      expect(() => CdnIntegrationPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(CdnIntegrationPriority.low().isLow()).toBe(true);
      expect(CdnIntegrationPriority.medium().isMedium()).toBe(true);
      expect(CdnIntegrationPriority.high().isHigh()).toBe(true);
      expect(CdnIntegrationPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('CdnIntegrationExecuted Event', () => {
    it('should create event', () => {
      var ev = CdnIntegrationExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = CdnIntegrationExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CdnIntegrationFailed Event', () => {
    it('should create failed event', () => {
      var ev = CdnIntegrationFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
