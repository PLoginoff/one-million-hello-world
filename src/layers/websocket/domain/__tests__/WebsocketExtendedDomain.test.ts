/**
 * Extended domain tests for Websocket
 */

import { WebsocketExecution } from '../entities/WebsocketExecution';
import { WebsocketConfigState as WebsocketConfigEntity } from '../entities/WebsocketConfigState';
import { WebsocketMetricsSnapshot } from '../entities/WebsocketMetricsSnapshot';
import { WebsocketThreshold } from '../value-objects/WebsocketThreshold';
import { WebsocketTimeWindow } from '../value-objects/WebsocketTimeWindow';
import { WebsocketPriority } from '../value-objects/WebsocketPriority';
import { WebsocketExecuted } from '../events/WebsocketExecuted';
import { WebsocketFailed } from '../events/WebsocketFailed';

describe('Extended Domain: Websocket', () => {
  describe('WebsocketExecution', () => {
    it('should create with pending status', () => {
      var exec = WebsocketExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = WebsocketExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = WebsocketExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = WebsocketExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = WebsocketExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = WebsocketExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('WebsocketThreshold', () => {
    it('should create within bounds', () => {
      var t = WebsocketThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => WebsocketThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = WebsocketThreshold.create(10);
      var high = WebsocketThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('WebsocketTimeWindow', () => {
    it('should create from minutes', () => {
      var w = WebsocketTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = WebsocketTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = WebsocketTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => WebsocketTimeWindow.create(100, 0)).toThrow();
      expect(() => WebsocketTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('WebsocketPriority', () => {
    it('should create with valid value', () => {
      var p1 = WebsocketPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => WebsocketPriority.create(15)).toThrow();
      expect(() => WebsocketPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(WebsocketPriority.low().isLow()).toBe(true);
      expect(WebsocketPriority.medium().isMedium()).toBe(true);
      expect(WebsocketPriority.high().isHigh()).toBe(true);
      expect(WebsocketPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('WebsocketExecuted Event', () => {
    it('should create event', () => {
      var ev = WebsocketExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = WebsocketExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('WebsocketFailed Event', () => {
    it('should create failed event', () => {
      var ev = WebsocketFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
