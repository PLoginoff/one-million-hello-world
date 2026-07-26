/**
 * Extended domain tests for Oauth2
 */

import { Oauth2Execution } from '../entities/Oauth2Execution';
import { Oauth2ConfigState as Oauth2ConfigEntity } from '../entities/Oauth2ConfigState';
import { Oauth2MetricsSnapshot } from '../entities/Oauth2MetricsSnapshot';
import { Oauth2Threshold } from '../value-objects/Oauth2Threshold';
import { Oauth2TimeWindow } from '../value-objects/Oauth2TimeWindow';
import { Oauth2Priority } from '../value-objects/Oauth2Priority';
import { Oauth2Executed } from '../events/Oauth2Executed';
import { Oauth2Failed } from '../events/Oauth2Failed';

describe('Extended Domain: Oauth2', () => {
  describe('Oauth2Execution', () => {
    it('should create with pending status', () => {
      var exec = Oauth2Execution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = Oauth2Execution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = Oauth2Execution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = Oauth2Execution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = Oauth2Execution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = Oauth2Execution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('Oauth2Threshold', () => {
    it('should create within bounds', () => {
      var t = Oauth2Threshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => Oauth2Threshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = Oauth2Threshold.create(10);
      var high = Oauth2Threshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('Oauth2TimeWindow', () => {
    it('should create from minutes', () => {
      var w = Oauth2TimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = Oauth2TimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = Oauth2TimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => Oauth2TimeWindow.create(100, 0)).toThrow();
      expect(() => Oauth2TimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('Oauth2Priority', () => {
    it('should create with valid value', () => {
      var p1 = Oauth2Priority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => Oauth2Priority.create(15)).toThrow();
      expect(() => Oauth2Priority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(Oauth2Priority.low().isLow()).toBe(true);
      expect(Oauth2Priority.medium().isMedium()).toBe(true);
      expect(Oauth2Priority.high().isHigh()).toBe(true);
      expect(Oauth2Priority.critical().isCritical()).toBe(true);
    });
  });

  describe('Oauth2Executed Event', () => {
    it('should create event', () => {
      var ev = Oauth2Executed.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = Oauth2Executed.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Oauth2Failed Event', () => {
    it('should create failed event', () => {
      var ev = Oauth2Failed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
