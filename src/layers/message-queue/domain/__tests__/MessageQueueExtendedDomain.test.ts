/**
 * Extended domain tests for MessageQueue
 */

import { MessageQueueExecution } from '../entities/MessageQueueExecution';
import { MessageQueueConfigState as MessageQueueConfigEntity } from '../entities/MessageQueueConfigState';
import { MessageQueueMetricsSnapshot } from '../entities/MessageQueueMetricsSnapshot';
import { MessageQueueThreshold } from '../value-objects/MessageQueueThreshold';
import { MessageQueueTimeWindow } from '../value-objects/MessageQueueTimeWindow';
import { MessageQueuePriority } from '../value-objects/MessageQueuePriority';
import { MessageQueueExecuted } from '../events/MessageQueueExecuted';
import { MessageQueueFailed } from '../events/MessageQueueFailed';

describe('Extended Domain: MessageQueue', () => {
  describe('MessageQueueExecution', () => {
    it('should create with pending status', () => {
      var exec = MessageQueueExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = MessageQueueExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = MessageQueueExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = MessageQueueExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = MessageQueueExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = MessageQueueExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('MessageQueueThreshold', () => {
    it('should create within bounds', () => {
      var t = MessageQueueThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => MessageQueueThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = MessageQueueThreshold.create(10);
      var high = MessageQueueThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('MessageQueueTimeWindow', () => {
    it('should create from minutes', () => {
      var w = MessageQueueTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = MessageQueueTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = MessageQueueTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => MessageQueueTimeWindow.create(100, 0)).toThrow();
      expect(() => MessageQueueTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('MessageQueuePriority', () => {
    it('should create with valid value', () => {
      var p1 = MessageQueuePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => MessageQueuePriority.create(15)).toThrow();
      expect(() => MessageQueuePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(MessageQueuePriority.low().isLow()).toBe(true);
      expect(MessageQueuePriority.medium().isMedium()).toBe(true);
      expect(MessageQueuePriority.high().isHigh()).toBe(true);
      expect(MessageQueuePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('MessageQueueExecuted Event', () => {
    it('should create event', () => {
      var ev = MessageQueueExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = MessageQueueExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MessageQueueFailed Event', () => {
    it('should create failed event', () => {
      var ev = MessageQueueFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
