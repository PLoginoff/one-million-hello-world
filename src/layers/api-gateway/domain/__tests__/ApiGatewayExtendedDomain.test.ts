/**
 * Extended domain tests for ApiGateway
 */

import { ApiGatewayExecution } from '../entities/ApiGatewayExecution';
import { ApiGatewayConfigState as ApiGatewayConfigEntity } from '../entities/ApiGatewayConfigState';
import { ApiGatewayMetricsSnapshot } from '../entities/ApiGatewayMetricsSnapshot';
import { ApiGatewayThreshold } from '../value-objects/ApiGatewayThreshold';
import { ApiGatewayTimeWindow } from '../value-objects/ApiGatewayTimeWindow';
import { ApiGatewayPriority } from '../value-objects/ApiGatewayPriority';
import { ApiGatewayExecuted } from '../events/ApiGatewayExecuted';
import { ApiGatewayFailed } from '../events/ApiGatewayFailed';

describe('Extended Domain: ApiGateway', () => {
  describe('ApiGatewayExecution', () => {
    it('should create with pending status', () => {
      var exec = ApiGatewayExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ApiGatewayExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ApiGatewayExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ApiGatewayExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ApiGatewayExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ApiGatewayExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ApiGatewayThreshold', () => {
    it('should create within bounds', () => {
      var t = ApiGatewayThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ApiGatewayThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ApiGatewayThreshold.create(10);
      var high = ApiGatewayThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ApiGatewayTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ApiGatewayTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ApiGatewayTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ApiGatewayTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ApiGatewayTimeWindow.create(100, 0)).toThrow();
      expect(() => ApiGatewayTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ApiGatewayPriority', () => {
    it('should create with valid value', () => {
      var p1 = ApiGatewayPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ApiGatewayPriority.create(15)).toThrow();
      expect(() => ApiGatewayPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ApiGatewayPriority.low().isLow()).toBe(true);
      expect(ApiGatewayPriority.medium().isMedium()).toBe(true);
      expect(ApiGatewayPriority.high().isHigh()).toBe(true);
      expect(ApiGatewayPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ApiGatewayExecuted Event', () => {
    it('should create event', () => {
      var ev = ApiGatewayExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ApiGatewayExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ApiGatewayFailed Event', () => {
    it('should create failed event', () => {
      var ev = ApiGatewayFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
