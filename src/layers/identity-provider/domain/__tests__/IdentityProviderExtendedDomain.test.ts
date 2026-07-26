/**
 * Extended domain tests for IdentityProvider
 */

import { IdentityProviderExecution } from '../entities/IdentityProviderExecution';
import { IdentityProviderConfigState as IdentityProviderConfigEntity } from '../entities/IdentityProviderConfigState';
import { IdentityProviderMetricsSnapshot } from '../entities/IdentityProviderMetricsSnapshot';
import { IdentityProviderThreshold } from '../value-objects/IdentityProviderThreshold';
import { IdentityProviderTimeWindow } from '../value-objects/IdentityProviderTimeWindow';
import { IdentityProviderPriority } from '../value-objects/IdentityProviderPriority';
import { IdentityProviderExecuted } from '../events/IdentityProviderExecuted';
import { IdentityProviderFailed } from '../events/IdentityProviderFailed';

describe('Extended Domain: IdentityProvider', () => {
  describe('IdentityProviderExecution', () => {
    it('should create with pending status', () => {
      var exec = IdentityProviderExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = IdentityProviderExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = IdentityProviderExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = IdentityProviderExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = IdentityProviderExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = IdentityProviderExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('IdentityProviderThreshold', () => {
    it('should create within bounds', () => {
      var t = IdentityProviderThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => IdentityProviderThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = IdentityProviderThreshold.create(10);
      var high = IdentityProviderThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('IdentityProviderTimeWindow', () => {
    it('should create from minutes', () => {
      var w = IdentityProviderTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = IdentityProviderTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = IdentityProviderTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => IdentityProviderTimeWindow.create(100, 0)).toThrow();
      expect(() => IdentityProviderTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('IdentityProviderPriority', () => {
    it('should create with valid value', () => {
      var p1 = IdentityProviderPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => IdentityProviderPriority.create(15)).toThrow();
      expect(() => IdentityProviderPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(IdentityProviderPriority.low().isLow()).toBe(true);
      expect(IdentityProviderPriority.medium().isMedium()).toBe(true);
      expect(IdentityProviderPriority.high().isHigh()).toBe(true);
      expect(IdentityProviderPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('IdentityProviderExecuted Event', () => {
    it('should create event', () => {
      var ev = IdentityProviderExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = IdentityProviderExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('IdentityProviderFailed Event', () => {
    it('should create failed event', () => {
      var ev = IdentityProviderFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
