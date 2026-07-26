/**
 * Extended domain tests for QueryObject
 */

import { QueryObjectExecution } from '../entities/QueryObjectExecution';
import { QueryObjectConfigState as QueryObjectConfigEntity } from '../entities/QueryObjectConfigState';
import { QueryObjectMetricsSnapshot } from '../entities/QueryObjectMetricsSnapshot';
import { QueryObjectThreshold } from '../value-objects/QueryObjectThreshold';
import { QueryObjectTimeWindow } from '../value-objects/QueryObjectTimeWindow';
import { QueryObjectPriority } from '../value-objects/QueryObjectPriority';
import { QueryObjectExecuted } from '../events/QueryObjectExecuted';
import { QueryObjectFailed } from '../events/QueryObjectFailed';

describe('Extended Domain: QueryObject', () => {
  describe('QueryObjectExecution', () => {
    it('should create with pending status', () => {
      var exec = QueryObjectExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = QueryObjectExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = QueryObjectExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = QueryObjectExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = QueryObjectExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = QueryObjectExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('QueryObjectThreshold', () => {
    it('should create within bounds', () => {
      var t = QueryObjectThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => QueryObjectThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = QueryObjectThreshold.create(10);
      var high = QueryObjectThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('QueryObjectTimeWindow', () => {
    it('should create from minutes', () => {
      var w = QueryObjectTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = QueryObjectTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = QueryObjectTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => QueryObjectTimeWindow.create(100, 0)).toThrow();
      expect(() => QueryObjectTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('QueryObjectPriority', () => {
    it('should create with valid value', () => {
      var p1 = QueryObjectPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => QueryObjectPriority.create(15)).toThrow();
      expect(() => QueryObjectPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(QueryObjectPriority.low().isLow()).toBe(true);
      expect(QueryObjectPriority.medium().isMedium()).toBe(true);
      expect(QueryObjectPriority.high().isHigh()).toBe(true);
      expect(QueryObjectPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('QueryObjectExecuted Event', () => {
    it('should create event', () => {
      var ev = QueryObjectExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = QueryObjectExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('QueryObjectFailed Event', () => {
    it('should create failed event', () => {
      var ev = QueryObjectFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
