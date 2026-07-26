/**
 * Extended domain tests for Transport
 */

import { TransportExecution } from '../entities/TransportExecution';
import { TransportConfigState as TransportConfigEntity } from '../entities/TransportConfigState';
import { TransportMetricsSnapshot } from '../entities/TransportMetricsSnapshot';
import { TransportThreshold } from '../value-objects/TransportThreshold';
import { TransportTimeWindow } from '../value-objects/TransportTimeWindow';
import { TransportPriority } from '../value-objects/TransportPriority';
import { TransportExecuted } from '../events/TransportExecuted';
import { TransportFailed } from '../events/TransportFailed';

describe('Extended Domain: Transport', () => {
  describe('TransportExecution', () => {
    it('should create with pending status', () => {
      var exec = TransportExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = TransportExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = TransportExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = TransportExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = TransportExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = TransportExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('TransportThreshold', () => {
    it('should create within bounds', () => {
      var t = TransportThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => TransportThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = TransportThreshold.create(10);
      var high = TransportThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('TransportTimeWindow', () => {
    it('should create from minutes', () => {
      var w = TransportTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = TransportTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = TransportTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => TransportTimeWindow.create(100, 0)).toThrow();
      expect(() => TransportTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('TransportPriority', () => {
    it('should create with valid value', () => {
      var p1 = TransportPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => TransportPriority.create(15)).toThrow();
      expect(() => TransportPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(TransportPriority.low().isLow()).toBe(true);
      expect(TransportPriority.medium().isMedium()).toBe(true);
      expect(TransportPriority.high().isHigh()).toBe(true);
      expect(TransportPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('TransportExecuted Event', () => {
    it('should create event', () => {
      var ev = TransportExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = TransportExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('TransportFailed Event', () => {
    it('should create failed event', () => {
      var ev = TransportFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
