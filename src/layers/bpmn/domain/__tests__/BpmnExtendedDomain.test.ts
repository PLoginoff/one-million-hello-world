/**
 * Extended domain tests for Bpmn
 */

import { BpmnExecution } from '../entities/BpmnExecution';
import { BpmnConfigState as BpmnConfigEntity } from '../entities/BpmnConfigState';
import { BpmnMetricsSnapshot } from '../entities/BpmnMetricsSnapshot';
import { BpmnThreshold } from '../value-objects/BpmnThreshold';
import { BpmnTimeWindow } from '../value-objects/BpmnTimeWindow';
import { BpmnPriority } from '../value-objects/BpmnPriority';
import { BpmnExecuted } from '../events/BpmnExecuted';
import { BpmnFailed } from '../events/BpmnFailed';

describe('Extended Domain: Bpmn', () => {
  describe('BpmnExecution', () => {
    it('should create with pending status', () => {
      var exec = BpmnExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = BpmnExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = BpmnExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = BpmnExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = BpmnExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = BpmnExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('BpmnThreshold', () => {
    it('should create within bounds', () => {
      var t = BpmnThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => BpmnThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = BpmnThreshold.create(10);
      var high = BpmnThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('BpmnTimeWindow', () => {
    it('should create from minutes', () => {
      var w = BpmnTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = BpmnTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = BpmnTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => BpmnTimeWindow.create(100, 0)).toThrow();
      expect(() => BpmnTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('BpmnPriority', () => {
    it('should create with valid value', () => {
      var p1 = BpmnPriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => BpmnPriority.create(15)).toThrow();
      expect(() => BpmnPriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(BpmnPriority.low().isLow()).toBe(true);
      expect(BpmnPriority.medium().isMedium()).toBe(true);
      expect(BpmnPriority.high().isHigh()).toBe(true);
      expect(BpmnPriority.critical().isCritical()).toBe(true);
    });
  });

  describe('BpmnExecuted Event', () => {
    it('should create event', () => {
      var ev = BpmnExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = BpmnExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('BpmnFailed Event', () => {
    it('should create failed event', () => {
      var ev = BpmnFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
