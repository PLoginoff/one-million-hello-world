/**
 * Extended domain tests for Gitops
 */

import { GitopsExecution } from '../entities/GitopsExecution';
import { GitopsConfigState as GitopsConfigEntity } from '../entities/GitopsConfigState';
import { GitopsMetricsSnapshot } from '../entities/GitopsMetricsSnapshot';
import { GitopsThreshold } from '../value-objects/GitopsThreshold';
import { GitopsTimeWindow } from '../value-objects/GitopsTimeWindow';
import { GitopsPriority } from '../value-objects/GitopsPriority';
import { GitopsExecuted } from '../events/GitopsExecuted';
import { GitopsFailed } from '../events/GitopsFailed';

describe('Extended Domain: Gitops', () => {
  describe('GitopsExecution', () => {
    it('should create with pending status', () => {
      var exec = GitopsExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = GitopsExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = GitopsExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = GitopsExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = GitopsExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = GitopsExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('GitopsThreshold', () => {
    it('should create within bounds', () => {
      var t = GitopsThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => GitopsThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = GitopsThreshold.create(10);
      var high = GitopsThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('GitopsTimeWindow', () => {
    it('should create from minutes', () => {
      var w = GitopsTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = GitopsTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = GitopsTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => GitopsTimeWindow.create(100, 0)).toThrow();
      expect(() => GitopsTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('GitopsPriority', () => {
    it('should create with valid value', () => {
      var p1 = GitopsPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => GitopsPriority.create(15)).toThrow();
      expect(() => GitopsPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(GitopsPriority.low().isLow()).toBe(true);
      expect(GitopsPriority.medium().isMedium()).toBe(true);
      expect(GitopsPriority.high().isHigh()).toBe(true);
      expect(GitopsPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('GitopsExecuted Event', () => {
    it('should create event', () => {
      var ev = GitopsExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = GitopsExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GitopsFailed Event', () => {
    it('should create failed event', () => {
      var ev = GitopsFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
