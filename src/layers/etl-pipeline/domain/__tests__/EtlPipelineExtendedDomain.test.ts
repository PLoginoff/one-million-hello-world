/**
 * Extended domain tests for EtlPipeline
 */

import { EtlPipelineExecution } from '../entities/EtlPipelineExecution';
import { EtlPipelineConfigState as EtlPipelineConfigEntity } from '../entities/EtlPipelineConfigState';
import { EtlPipelineMetricsSnapshot } from '../entities/EtlPipelineMetricsSnapshot';
import { EtlPipelineThreshold } from '../value-objects/EtlPipelineThreshold';
import { EtlPipelineTimeWindow } from '../value-objects/EtlPipelineTimeWindow';
import { EtlPipelinePriority } from '../value-objects/EtlPipelinePriority';
import { EtlPipelineExecuted } from '../events/EtlPipelineExecuted';
import { EtlPipelineFailed } from '../events/EtlPipelineFailed';

describe('Extended Domain: EtlPipeline', () => {
  describe('EtlPipelineExecution', () => {
    it('should create with pending status', () => {
      var exec = EtlPipelineExecution.create();
      expect(exec.isPending()).toBe(true);
      expect(exec.data.id).toBeDefined();
    });

    it('should transition through lifecycle', () => {
      var exec = EtlPipelineExecution.create();
      expect(exec.isPending()).toBe(true);
      var active = exec.activate();
      expect(active.isActive()).toBe(true);
      var done = active.complete();
      expect(done.isCompleted()).toBe(true);
    });

    it('should fail', () => {
      var exec = EtlPipelineExecution.create();
      var failed = exec.fail();
      expect(failed.isFailed()).toBe(true);
    });

    it('should manage tags', () => {
      var exec = EtlPipelineExecution.create();
      var tagged = exec.addTag('important');
      expect(tagged.data.tags).toContain('important');
      var untagged = tagged.removeTag('important');
      expect(untagged.data.tags).not.toContain('important');
    });

    it('should not duplicate tags', () => {
      var exec = EtlPipelineExecution.create();
      var tagged = exec.addTag('test').addTag('test');
      expect(tagged.data.tags.length).toBe(1);
    });

    it('should update attributes immutably', () => {
      var exec = EtlPipelineExecution.create({ initial: true });
      var updated = exec.updateAttributes({ new: 'value' });
      expect(updated.data.attributes.new).toBe('value');
      expect(exec.data.attributes.new).toBeUndefined();
    });
  });

  describe('EtlPipelineThreshold', () => {
    it('should create within bounds', () => {
      var t = EtlPipelineThreshold.create(50, 0, 100);
      expect(t.value).toBe(50);
    });

    it('should reject out of bounds', () => {
      expect(() => EtlPipelineThreshold.create(150, 0, 100)).toThrow();
    });

    it('should compare thresholds', () => {
      var low = EtlPipelineThreshold.create(10);
      var high = EtlPipelineThreshold.create(90);
      expect(low.isBelow(high)).toBe(true);
      expect(high.isAbove(low)).toBe(true);
    });
  });

  describe('EtlPipelineTimeWindow', () => {
    it('should create from minutes', () => {
      var w = EtlPipelineTimeWindow.fromMinutes(5);
      expect(w.durationMs).toBe(300000);
    });

    it('should create from seconds', () => {
      var w = EtlPipelineTimeWindow.fromSeconds(30);
      expect(w.durationMs).toBe(30000);
    });

    it('should check if timestamp is contained', () => {
      var now = Date.now();
      var w = EtlPipelineTimeWindow.create(now, 1000);
      expect(w.contains(now + 500)).toBe(true);
      expect(w.contains(now + 2000)).toBe(false);
    });

    it('should reject zero or negative duration', () => {
      expect(() => EtlPipelineTimeWindow.create(100, 0)).toThrow();
      expect(() => EtlPipelineTimeWindow.create(100, -1)).toThrow();
    });
  });

  describe('EtlPipelinePriority', () => {
    it('should create with valid value', () => {
      var p1 = EtlPipelinePriority.create(5);
      expect(p1.value).toBe(5);
      expect(p1.label).toBe('medium');
    });

    it('should reject out of range', () => {
      expect(() => EtlPipelinePriority.create(15)).toThrow();
      expect(() => EtlPipelinePriority.create(-1)).toThrow();
    });

    it('should have static presets', () => {
      expect(EtlPipelinePriority.low().isLow()).toBe(true);
      expect(EtlPipelinePriority.medium().isMedium()).toBe(true);
      expect(EtlPipelinePriority.high().isHigh()).toBe(true);
      expect(EtlPipelinePriority.critical().isCritical()).toBe(true);
    });
  });

  describe('EtlPipelineExecuted Event', () => {
    it('should create event', () => {
      var ev = EtlPipelineExecuted.create('exec-1', 100, true);
      expect(ev.payload.executionId).toBe('exec-1');
      expect(ev.payload.success).toBe(true);
    });

    it('should compute age', () => {
      var ev = EtlPipelineExecuted.create('exec-2', 50, true);
      expect(ev.getAge()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EtlPipelineFailed Event', () => {
    it('should create failed event', () => {
      var ev = EtlPipelineFailed.create('exec-3', 200, false, { reason: 'timeout' });
      expect(ev.payload.success).toBe(false);
      expect(ev.payload.metadata.reason).toBe('timeout');
    });
  });
});
