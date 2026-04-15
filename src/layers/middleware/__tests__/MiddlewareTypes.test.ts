/**
 * Middleware Types Tests
 * 
 * Tests for Middleware Layer type definitions and enums.
 * Ensures type correctness and enum uniqueness.
 */

import {
  LogLevel,
  LogCategory,
  MetricType,
  MetricAggregation,
  SpanStatus,
  LogOutputFormat,
  LogOutputTarget,
  StageType,
} from '../types/middleware-types';

describe('MiddlewareTypes', () => {
  describe('LogLevel', () => {
    it('should have unique log levels', () => {
      const levels = Object.values(LogLevel);
      const uniqueLevels = new Set(levels);
      expect(levels.length).toBe(uniqueLevels.size);
    });

    it('should contain all expected log levels', () => {
      expect(LogLevel.TRACE).toBe('TRACE');
      expect(LogLevel.DEBUG).toBe('DEBUG');
      expect(LogLevel.INFO).toBe('INFO');
      expect(LogLevel.WARN).toBe('WARN');
      expect(LogLevel.ERROR).toBe('ERROR');
      expect(LogLevel.FATAL).toBe('FATAL');
    });
  });

  describe('LogCategory', () => {
    it('should have unique log categories', () => {
      const categories = Object.values(LogCategory);
      const uniqueCategories = new Set(categories);
      expect(categories.length).toBe(uniqueCategories.size);
    });

    it('should contain all expected log categories', () => {
      expect(LogCategory.GENERAL).toBe('GENERAL');
      expect(LogCategory.HTTP).toBe('HTTP');
      expect(LogCategory.DATABASE).toBe('DATABASE');
      expect(LogCategory.CACHE).toBe('CACHE');
      expect(LogCategory.SECURITY).toBe('SECURITY');
      expect(LogCategory.PERFORMANCE).toBe('PERFORMANCE');
      expect(LogCategory.BUSINESS).toBe('BUSINESS');
      expect(LogCategory.SYSTEM).toBe('SYSTEM');
    });
  });

  describe('MetricType', () => {
    it('should have unique metric types', () => {
      const types = Object.values(MetricType);
      const uniqueTypes = new Set(types);
      expect(types.length).toBe(uniqueTypes.size);
    });

    it('should contain all expected metric types', () => {
      expect(MetricType.COUNTER).toBe('COUNTER');
      expect(MetricType.GAUGE).toBe('GAUGE');
      expect(MetricType.HISTOGRAM).toBe('HISTOGRAM');
      expect(MetricType.SUMMARY).toBe('SUMMARY');
    });
  });

  describe('MetricAggregation', () => {
    it('should have unique aggregation types', () => {
      const aggregations = Object.values(MetricAggregation);
      const uniqueAggregations = new Set(aggregations);
      expect(aggregations.length).toBe(uniqueAggregations.size);
    });

    it('should contain all expected aggregation types', () => {
      expect(MetricAggregation.SUM).toBe('SUM');
      expect(MetricAggregation.AVG).toBe('AVG');
      expect(MetricAggregation.MIN).toBe('MIN');
      expect(MetricAggregation.MAX).toBe('MAX');
      expect(MetricAggregation.COUNT).toBe('COUNT');
      expect(MetricAggregation.P50).toBe('P50');
      expect(MetricAggregation.P95).toBe('P95');
      expect(MetricAggregation.P99).toBe('P99');
    });
  });

  describe('SpanStatus', () => {
    it('should have unique span statuses', () => {
      const statuses = Object.values(SpanStatus);
      const uniqueStatuses = new Set(statuses);
      expect(statuses.length).toBe(uniqueStatuses.size);
    });

    it('should contain all expected span statuses', () => {
      expect(SpanStatus.OK).toBe('OK');
      expect(SpanStatus.ERROR).toBe('ERROR');
      expect(SpanStatus.CANCELLED).toBe('CANCELLED');
      expect(SpanStatus.TIMEOUT).toBe('TIMEOUT');
      expect(SpanStatus.UNKNOWN).toBe('UNKNOWN');
    });
  });

  describe('LogOutputFormat', () => {
    it('should have unique output formats', () => {
      const formats = Object.values(LogOutputFormat);
      const uniqueFormats = new Set(formats);
      expect(formats.length).toBe(uniqueFormats.size);
    });

    it('should contain all expected output formats', () => {
      expect(LogOutputFormat.JSON).toBe('JSON');
      expect(LogOutputFormat.TEXT).toBe('TEXT');
      expect(LogOutputFormat.PRETTY).toBe('PRETTY');
    });
  });

  describe('LogOutputTarget', () => {
    it('should have unique output targets', () => {
      const targets = Object.values(LogOutputTarget);
      const uniqueTargets = new Set(targets);
      expect(targets.length).toBe(uniqueTargets.size);
    });

    it('should contain all expected output targets', () => {
      expect(LogOutputTarget.CONSOLE).toBe('CONSOLE');
      expect(LogOutputTarget.FILE).toBe('FILE');
      expect(LogOutputTarget.REMOTE).toBe('REMOTE');
      expect(LogOutputTarget.BOTH).toBe('BOTH');
    });
  });

  describe('StageType', () => {
    it('should have unique stage types', () => {
      const types = Object.values(StageType);
      const uniqueTypes = new Set(types);
      expect(types.length).toBe(uniqueTypes.size);
    });

    it('should contain all expected stage types', () => {
      expect(StageType.LOGGING).toBe('LOGGING');
      expect(StageType.METRICS).toBe('METRICS');
      expect(StageType.TRACING).toBe('TRACING');
      expect(StageType.CORRELATION).toBe('CORRELATION');
      expect(StageType.AUTHENTICATION).toBe('AUTHENTICATION');
      expect(StageType.AUTHORIZATION).toBe('AUTHORIZATION');
      expect(StageType.CACHING).toBe('CACHING');
      expect(StageType.RATE_LIMITING).toBe('RATE_LIMITING');
      expect(StageType.CUSTOM).toBe('CUSTOM');
    });
  });

  describe('Enum Uniqueness Across All Enums', () => {
    it('should have no duplicate values across all enums', () => {
      const allValues = [
        ...Object.values(LogLevel),
        ...Object.values(LogCategory),
        ...Object.values(MetricType),
        ...Object.values(MetricAggregation),
        ...Object.values(SpanStatus),
        ...Object.values(LogOutputFormat),
        ...Object.values(LogOutputTarget),
        ...Object.values(StageType),
      ];

      const uniqueValues = new Set(allValues);
      expect(allValues.length).toBe(uniqueValues.size);
    });
  });
});
