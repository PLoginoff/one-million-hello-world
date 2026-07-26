/**
 * Extended domain tests for MessageBus
 */

import { MessageBusExecution } from '../entities/MessageBusExecution';
import { MessageBusConfigState as MessageBusConfigEntity } from '../entities/MessageBusConfigState';
import { MessageBusMetricsSnapshot } from '../entities/MessageBusMetricsSnapshot';
import { MessageBusThreshold } from '../value-objects/MessageBusThreshold';
import { MessageBusTimeWindow } from '../value-objects/MessageBusTimeWindow';
import { MessageBusPriority } from '../value-objects/MessageBusPriority';
import { MessageBusExecuted } from '../events/MessageBusExecuted';
import { MessageBusFailed } from '../events/MessageBusFailed';

describe('Extended Domain: MessageBus', () => {
  describe('MessageBusExecution', () => {
    it('should create with pending status', () => {
      var exec = MessageBusExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MessageBusExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MessageBusExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MessageBusExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MessageBusExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MessageBusExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MessageBusThreshold', () => {
    it('should create within bounds', () => {
      var t = MessageBusThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MessageBusThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MessageBusThreshold.create(10);
      var high = MessageBusThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MessageBusTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MessageBusTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MessageBusTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MessageBusTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MessageBusTimeWindow.create(100, 0)).toThrow();
      expect(() => MessageBusTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MessageBusPriority', () => {
    it('should create with valid value', () => {
      var p1 = MessageBusPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MessageBusPriority.create(15)).toThrow();
      expect(() => MessageBusPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MessageBusPriority.low().isLow()).toBe(true);
      expect(MessageBusPriority.medium().isMedium()).toBe(true);
      expect(MessageBusPriority.high().isHigh()).toBe(true);
      expect(MessageBusPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MessageBusExecuted Event', () => {
    it('should create event', () => {
      var ev = MessageBusExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MessageBusExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MessageBusFailed Event', () => {
    it('should create failed event', () => {
      var ev = MessageBusFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
