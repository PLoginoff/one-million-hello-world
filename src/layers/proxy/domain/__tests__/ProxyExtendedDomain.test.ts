/**
 * Extended domain tests for Proxy
 */

import { ProxyExecution } from '../entities/ProxyExecution';
import { ProxyConfigState as ProxyConfigEntity } from '../entities/ProxyConfigState';
import { ProxyMetricsSnapshot } from '../entities/ProxyMetricsSnapshot';
import { ProxyThreshold } from '../value-objects/ProxyThreshold';
import { ProxyTimeWindow } from '../value-objects/ProxyTimeWindow';
import { ProxyPriority } from '../value-objects/ProxyPriority';
import { ProxyExecuted } from '../events/ProxyExecuted';
import { ProxyFailed } from '../events/ProxyFailed';

describe('Extended Domain: Proxy', () => {
  describe('ProxyExecution', () => {
    it('should create with pending status', () => {
      var exec = ProxyExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = ProxyExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = ProxyExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = ProxyExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = ProxyExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = ProxyExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('ProxyThreshold', () => {
    it('should create within bounds', () => {
      var t = ProxyThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => ProxyThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = ProxyThreshold.create(10);
      var high = ProxyThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('ProxyTimeWindow', () => {
    it('should create from minutes', () => {
      var w = ProxyTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = ProxyTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = ProxyTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => ProxyTimeWindow.create(100, 0)).toThrow();
      expect(() => ProxyTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('ProxyPriority', () => {
    it('should create with valid value', () => {
      var p1 = ProxyPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => ProxyPriority.create(15)).toThrow();
      expect(() => ProxyPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(ProxyPriority.low().isLow()).toBe(true);
      expect(ProxyPriority.medium().isMedium()).toBe(true);
      expect(ProxyPriority.high().isHigh()).toBe(true);
      expect(ProxyPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('ProxyExecuted Event', () => {
    it('should create event', () => {
      var ev = ProxyExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = ProxyExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ProxyFailed Event', () => {
    it('should create failed event', () => {
      var ev = ProxyFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
