/**
 * Extended domain tests for Governance
 */

import { GovernanceExecution } from '../entities/GovernanceExecution';
import { GovernanceConfigState as GovernanceConfigEntity } from '../entities/GovernanceConfigState';
import { GovernanceMetricsSnapshot } from '../entities/GovernanceMetricsSnapshot';
import { GovernanceThreshold } from '../value-objects/GovernanceThreshold';
import { GovernanceTimeWindow } from '../value-objects/GovernanceTimeWindow';
import { GovernancePriority } from '../value-objects/GovernancePriority';
import { GovernanceExecuted } from '../events/GovernanceExecuted';
import { GovernanceFailed } from '../events/GovernanceFailed';

describe('Extended Domain: Governance', () => {
  describe('GovernanceExecution', () => {
    it('should create with pending status', () => {
      var exec = GovernanceExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = GovernanceExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = GovernanceExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = GovernanceExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = GovernanceExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = GovernanceExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('GovernanceThreshold', () => {
    it('should create within bounds', () => {
      var t = GovernanceThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => GovernanceThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = GovernanceThreshold.create(10);
      var high = GovernanceThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('GovernanceTimeWindow', () => {
    it('should create from minutes', () => {
      var w = GovernanceTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = GovernanceTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = GovernanceTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => GovernanceTimeWindow.create(100, 0)).toThrow();
      expect(() => GovernanceTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('GovernancePriority', () => {
    it('should create with valid value', () => {
      var p1 = GovernancePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => GovernancePriority.create(15)).toThrow();
      expect(() => GovernancePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(GovernancePriority.low().isLow()).toBe(true);
      expect(GovernancePriority.medium().isMedium()).toBe(true);
      expect(GovernancePriority.high().isHigh()).toBe(true);
      expect(GovernancePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('GovernanceExecuted Event', () => {
    it('should create event', () => {
      var ev = GovernanceExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = GovernanceExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GovernanceFailed Event', () => {
    it('should create failed event', () => {
      var ev = GovernanceFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
