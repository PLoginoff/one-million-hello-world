/**
 * Extended domain tests for Graphql
 */

import { GraphqlExecution } from '../entities/GraphqlExecution';
import { GraphqlConfigState as GraphqlConfigEntity } from '../entities/GraphqlConfigState';
import { GraphqlMetricsSnapshot } from '../entities/GraphqlMetricsSnapshot';
import { GraphqlThreshold } from '../value-objects/GraphqlThreshold';
import { GraphqlTimeWindow } from '../value-objects/GraphqlTimeWindow';
import { GraphqlPriority } from '../value-objects/GraphqlPriority';
import { GraphqlExecuted } from '../events/GraphqlExecuted';
import { GraphqlFailed } from '../events/GraphqlFailed';

describe('Extended Domain: Graphql', () => {
  describe('GraphqlExecution', () => {
    it('should create with pending status', () => {
      var exec = GraphqlExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = GraphqlExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = GraphqlExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = GraphqlExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = GraphqlExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = GraphqlExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('GraphqlThreshold', () => {
    it('should create within bounds', () => {
      var t = GraphqlThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => GraphqlThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = GraphqlThreshold.create(10);
      var high = GraphqlThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('GraphqlTimeWindow', () => {
    it('should create from minutes', () => {
      var w = GraphqlTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = GraphqlTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = GraphqlTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => GraphqlTimeWindow.create(100, 0)).toThrow();
      expect(() => GraphqlTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('GraphqlPriority', () => {
    it('should create with valid value', () => {
      var p1 = GraphqlPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => GraphqlPriority.create(15)).toThrow();
      expect(() => GraphqlPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(GraphqlPriority.low().isLow()).toBe(true);
      expect(GraphqlPriority.medium().isMedium()).toBe(true);
      expect(GraphqlPriority.high().isHigh()).toBe(true);
      expect(GraphqlPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('GraphqlExecuted Event', () => {
    it('should create event', () => {
      var ev = GraphqlExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = GraphqlExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GraphqlFailed Event', () => {
    it('should create failed event', () => {
      var ev = GraphqlFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
