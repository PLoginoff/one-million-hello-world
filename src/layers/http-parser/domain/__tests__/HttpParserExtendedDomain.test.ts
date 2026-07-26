/**
 * Extended domain tests for HttpParser
 */

import { HttpParserExecution } from '../entities/HttpParserExecution';
import { HttpParserConfigState as HttpParserConfigEntity } from '../entities/HttpParserConfigState';
import { HttpParserMetricsSnapshot } from '../entities/HttpParserMetricsSnapshot';
import { HttpParserThreshold } from '../value-objects/HttpParserThreshold';
import { HttpParserTimeWindow } from '../value-objects/HttpParserTimeWindow';
import { HttpParserPriority } from '../value-objects/HttpParserPriority';
import { HttpParserExecuted } from '../events/HttpParserExecuted';
import { HttpParserFailed } from '../events/HttpParserFailed';

describe('Extended Domain: HttpParser', () => {
  describe('HttpParserExecution', () => {
    it('should create with pending status', () => {
      var exec = HttpParserExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = HttpParserExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = HttpParserExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = HttpParserExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = HttpParserExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = HttpParserExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('HttpParserThreshold', () => {
    it('should create within bounds', () => {
      var t = HttpParserThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => HttpParserThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = HttpParserThreshold.create(10);
      var high = HttpParserThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('HttpParserTimeWindow', () => {
    it('should create from minutes', () => {
      var w = HttpParserTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = HttpParserTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = HttpParserTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => HttpParserTimeWindow.create(100, 0)).toThrow();
      expect(() => HttpParserTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('HttpParserPriority', () => {
    it('should create with valid value', () => {
      var p1 = HttpParserPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => HttpParserPriority.create(15)).toThrow();
      expect(() => HttpParserPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(HttpParserPriority.low().isLow()).toBe(true);
      expect(HttpParserPriority.medium().isMedium()).toBe(true);
      expect(HttpParserPriority.high().isHigh()).toBe(true);
      expect(HttpParserPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('HttpParserExecuted Event', () => {
    it('should create event', () => {
      var ev = HttpParserExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = HttpParserExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('HttpParserFailed Event', () => {
    it('should create failed event', () => {
      var ev = HttpParserFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
