/**
 * Rate Limiting Errors Tests
 */

import {
  RateLimitingError,
  RateLimitingConfigurationError,
  RateLimitingExecutionError,
  RateLimitingTimeoutError,
  RateLimitingValidationError,
  RateLimitExceededError,
  RateLimitBucketNotFoundError,
  RateLimitInvalidIdentifierError,
  RateLimitRuleConflictError,
  RateLimitQuotaExhaustedError,
  RateLimitTierNotFoundError,
  RateLimitInternalLayerError,
  RateLimitCrossLayerError,
  RateLimitAdaptiveError,
  RateLimitCascadeError,
  RateLimitingErrorFactory,
  RateLimitingErrorCode,
} from '../errors';

describe('RateLimitingError', () => {
  describe('Base RateLimitingError', () => {
    it('should create error with code and message', () => {
      const error = new RateLimitingError('RATE_LIMIT_CONFIGURATION_ERROR', 'Test error');
      expect(error.code).toBe('RATE_LIMIT_CONFIGURATION_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('RateLimitingError');
      expect(error.isOperational).toBe(true);
      expect(error.context.timestamp).toBeDefined();
    });

    it('should include context', () => {
      const error = new RateLimitingError('RATE_LIMIT_CONFIGURATION_ERROR', 'Test', {
        operation: 'test-op',
        identifier: 'user-123',
      });
      expect(error.context.operation).toBe('test-op');
      expect(error.context.identifier).toBe('user-123');
    });

    it('should serialize to JSON', () => {
      const error = new RateLimitingError('RATE_LIMIT_CONFIGURATION_ERROR', 'Test', { operation: 'test' });
      const json = error.toJSON();
      expect(json.name).toBe('RateLimitingError');
      expect(json.code).toBe('RATE_LIMIT_CONFIGURATION_ERROR');
      expect(json.message).toBe('Test');
    });

    it('should check error code', () => {
      const error = new RateLimitingError('RATE_LIMIT_CONFIGURATION_ERROR', 'Test');
      expect(error.isCode('RATE_LIMIT_CONFIGURATION_ERROR')).toBe(true);
      expect(error.isCode('RATE_LIMIT_EXECUTION_ERROR')).toBe(false);
    });
  });

  describe('RateLimitingConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new RateLimitingConfigurationError('Invalid config');
      expect(error.code).toBe('RATE_LIMIT_CONFIGURATION_ERROR');
      expect(error.name).toBe('RateLimitingConfigurationError');
    });

    it('should create invalid config error', () => {
      const error = RateLimitingConfigurationError.invalidConfig('defaultLimit', -1);
      expect(error.message).toContain('defaultLimit');
    });

    it('should create missing config error', () => {
      const error = RateLimitingConfigurationError.missingConfig('windowMs');
      expect(error.message).toContain('windowMs');
    });

    it('should create invalid algorithm error', () => {
      const error = RateLimitingConfigurationError.invalidAlgorithm('invalid-algo');
      expect(error.message).toContain('invalid-algo');
    });

    it('should create invalid window error', () => {
      const error = RateLimitingConfigurationError.invalidWindow(-1000);
      expect(error.message).toContain('-1000');
    });
  });

  describe('RateLimitingExecutionError', () => {
    it('should create execution error', () => {
      const error = new RateLimitingExecutionError('Operation failed');
      expect(error.code).toBe('RATE_LIMIT_EXECUTION_ERROR');
      expect(error.name).toBe('RateLimitingExecutionError');
    });

    it('should create operation failed error', () => {
      const error = RateLimitingExecutionError.operationFailed('check-rate-limit', 'Redis connection failed');
      expect(error.message).toContain('check-rate-limit');
      expect(error.context.operation).toBe('check-rate-limit');
    });

    it('should create strategy execution failed error', () => {
      const error = RateLimitingExecutionError.strategyExecutionFailed('sliding-window', 'Timeout');
      expect(error.message).toContain('sliding-window');
    });

    it('should create bucket operation failed error', () => {
      const error = RateLimitingExecutionError.bucketOperationFailed('increment', 'user-123', 'Lock timeout');
      expect(error.message).toContain('increment');
      expect(error.context.identifier).toBe('user-123');
    });
  });

  describe('RateLimitingTimeoutError', () => {
    it('should create timeout error', () => {
      const error = new RateLimitingTimeoutError('check-rate-limit', 5000);
      expect(error.code).toBe('RATE_LIMIT_TIMEOUT_ERROR');
      expect(error.name).toBe('RateLimitingTimeoutError');
      expect(error.timeoutMs).toBe(5000);
      expect(error.operation).toBe('check-rate-limit');
    });

    it('should create check timeout', () => {
      const error = RateLimitingTimeoutError.checkTimeout(3000);
      expect(error.operation).toBe('check-rate-limit');
    });

    it('should create bucket operation timeout', () => {
      const error = RateLimitingTimeoutError.bucketOperationTimeout('increment', 2000);
      expect(error.operation).toBe('bucket-increment');
    });

    it('should create cleanup timeout', () => {
      const error = RateLimitingTimeoutError.cleanupTimeout(1000);
      expect(error.operation).toBe('cleanup-expired-buckets');
    });
  });

  describe('RateLimitingValidationError', () => {
    it('should create validation error', () => {
      const error = new RateLimitingValidationError('field', 'value', 'must be positive');
      expect(error.code).toBe('RATE_LIMIT_VALIDATION_ERROR');
      expect(error.name).toBe('RateLimitingValidationError');
      expect(error.field).toBe('field');
      expect(error.value).toBe('value');
    });

    it('should create invalid field error', () => {
      const error = RateLimitingValidationError.invalidField('limit', -1, 'must be positive');
      expect(error.field).toBe('limit');
    });

    it('should create missing field error', () => {
      const error = RateLimitingValidationError.missingField('windowMs');
      expect(error.field).toBe('windowMs');
      expect(error.value).toBeUndefined();
    });

    it('should create invalid identifier error', () => {
      const error = RateLimitingValidationError.invalidIdentifier('', 'empty');
      expect(error.field).toBe('identifier');
    });

    it('should create invalid limit error', () => {
      const error = RateLimitingValidationError.invalidLimit(-1);
      expect(error.field).toBe('limit');
    });

    it('should create invalid window error', () => {
      const error = RateLimitingValidationError.invalidWindow(-1000);
      expect(error.field).toBe('window');
    });
  });

  describe('RateLimitExceededError', () => {
    it('should create rate limit exceeded error', () => {
      const error = new RateLimitExceededError('user-123', 100, 60000, 101, 30000, Date.now() + 30000);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.name).toBe('RateLimitExceededError');
      expect(error.identifier).toBe('user-123');
      expect(error.limit).toBe(100);
      expect(error.currentCount).toBe(101);
      expect(error.retryAfterMs).toBe(30000);
    });

    it('should create from bucket info', () => {
      const resetTime = Date.now() + 30000;
      const error = RateLimitExceededError.fromBucketInfo('user-123', 100, 60000, 101, resetTime);
      expect(error.identifier).toBe('user-123');
      expect(error.resetTime).toBe(resetTime);
    });
  });

  describe('RateLimitBucketNotFoundError', () => {
    it('should create bucket not found error', () => {
      const error = new RateLimitBucketNotFoundError('user-123');
      expect(error.code).toBe('RATE_LIMIT_BUCKET_NOT_FOUND');
      expect(error.name).toBe('RateLimitBucketNotFoundError');
      expect(error.identifier).toBe('user-123');
    });
  });

  describe('RateLimitInvalidIdentifierError', () => {
    it('should create invalid identifier error', () => {
      const error = new RateLimitInvalidIdentifierError('bad@id', 'invalid chars');
      expect(error.code).toBe('RATE_LIMIT_INVALID_IDENTIFIER');
      expect(error.name).toBe('RateLimitInvalidIdentifierError');
      expect(error.identifier).toBe('bad@id');
      expect(error.reason).toBe('invalid chars');
    });

    it('should create empty identifier error', () => {
      const error = RateLimitInvalidIdentifierError.emptyIdentifier();
      expect(error.identifier).toBe('');
      expect(error.reason).toBe('identifier cannot be empty');
    });

    it('should create malformed identifier error', () => {
      const error = RateLimitInvalidIdentifierError.malformedIdentifier('bad id');
      expect(error.reason).toBe('identifier contains invalid characters');
    });
  });

  describe('RateLimitRuleConflictError', () => {
    it('should create rule conflict error', () => {
      const error = new RateLimitRuleConflictError('rule-1', 'rule-2', 'overlapping scope');
      expect(error.code).toBe('RATE_LIMIT_RULE_CONFLICT');
      expect(error.name).toBe('RateLimitRuleConflictError');
      expect(error.ruleId).toBe('rule-1');
      expect(error.conflictingRuleId).toBe('rule-2');
    });
  });

  describe('RateLimitQuotaExhaustedError', () => {
    it('should create quota exhausted error', () => {
      const error = new RateLimitQuotaExhaustedError('user-123', 1000, 1000, Date.now() + 3600000);
      expect(error.code).toBe('RATE_LIMIT_QUOTA_EXHAUSTED');
      expect(error.name).toBe('RateLimitQuotaExhaustedError');
      expect(error.identifier).toBe('user-123');
      expect(error.quota).toBe(1000);
      expect(error.used).toBe(1000);
    });
  });

  describe('RateLimitTierNotFoundError', () => {
    it('should create tier not found error', () => {
      const error = new RateLimitTierNotFoundError('premium');
      expect(error.code).toBe('RATE_LIMIT_TIER_NOT_FOUND');
      expect(error.name).toBe('RateLimitTierNotFoundError');
      expect(error.tier).toBe('premium');
    });
  });

  describe('RateLimitInternalLayerError', () => {
    it('should create internal layer error', () => {
      const error = new RateLimitInternalLayerError('api-gateway', 'check-rate-limit', 'Circuit breaker open');
      expect(error.code).toBe('RATE_LIMIT_INTERNAL_LAYER_ERROR');
      expect(error.name).toBe('RateLimitInternalLayerError');
      expect(error.layer).toBe('api-gateway');
      expect(error.operation).toBe('check-rate-limit');
    });
  });

  describe('RateLimitCrossLayerError', () => {
    it('should create cross layer error', () => {
      const error = new RateLimitCrossLayerError('auth', 'rate-limit', 'check-rate-limit', 'Dependency failed');
      expect(error.code).toBe('RATE_LIMIT_CROSS_LAYER_ERROR');
      expect(error.name).toBe('RateLimitCrossLayerError');
      expect(error.sourceLayer).toBe('auth');
      expect(error.targetLayer).toBe('rate-limit');
    });
  });

  describe('RateLimitAdaptiveError', () => {
    it('should create adaptive error', () => {
      const error = new RateLimitAdaptiveError('user-123', 'Prediction model unavailable');
      expect(error.code).toBe('RATE_LIMIT_ADAPTIVE_ERROR');
      expect(error.name).toBe('RateLimitAdaptiveError');
      expect(error.identifier).toBe('user-123');
      expect(error.predictionError).toBe('Prediction model unavailable');
    });
  });

  describe('RateLimitCascadeError', () => {
    it('should create cascade error', () => {
      const error = new RateLimitCascadeError('cascade-1', 'api-gateway', 'Downstream timeout');
      expect(error.code).toBe('RATE_LIMIT_CASCADE_ERROR');
      expect(error.name).toBe('RateLimitCascadeError');
      expect(error.cascadeId).toBe('cascade-1');
      expect(error.failedLayer).toBe('api-gateway');
    });
  });

  describe('RateLimitingErrorFactory', () => {
    it('should create configuration error', () => {
      const error = RateLimitingErrorFactory.configuration('Test');
      expect(error).toBeInstanceOf(RateLimitingConfigurationError);
    });

    it('should create execution error', () => {
      const error = RateLimitingErrorFactory.execution('Test');
      expect(error).toBeInstanceOf(RateLimitingExecutionError);
    });

    it('should create timeout error', () => {
      const error = RateLimitingErrorFactory.timeout('check', 5000);
      expect(error).toBeInstanceOf(RateLimitingTimeoutError);
    });

    it('should create validation error', () => {
      const error = RateLimitingErrorFactory.validation('field', 'value', 'constraint');
      expect(error).toBeInstanceOf(RateLimitingValidationError);
    });

    it('should create rate limit exceeded error', () => {
      const error = RateLimitingErrorFactory.rateLimitExceeded('id', 100, 60000, 101, 30000, Date.now() + 30000);
      expect(error).toBeInstanceOf(RateLimitExceededError);
    });

    it('should create bucket not found error', () => {
      const error = RateLimitingErrorFactory.bucketNotFound('id');
      expect(error).toBeInstanceOf(RateLimitBucketNotFoundError);
    });

    it('should create invalid identifier error', () => {
      const error = RateLimitingErrorFactory.invalidIdentifier('id', 'reason');
      expect(error).toBeInstanceOf(RateLimitInvalidIdentifierError);
    });

    it('should create rule conflict error', () => {
      const error = RateLimitingErrorFactory.ruleConflict('r1', 'r2', 'reason');
      expect(error).toBeInstanceOf(RateLimitRuleConflictError);
    });

    it('should create quota exhausted error', () => {
      const error = RateLimitingErrorFactory.quotaExhausted('id', 100, 100, Date.now() + 3600000);
      expect(error).toBeInstanceOf(RateLimitQuotaExhaustedError);
    });

    it('should create tier not found error', () => {
      const error = RateLimitingErrorFactory.tierNotFound('tier');
      expect(error).toBeInstanceOf(RateLimitTierNotFoundError);
    });

    it('should create internal layer error', () => {
      const error = RateLimitingErrorFactory.internalLayer('layer', 'op', 'msg');
      expect(error).toBeInstanceOf(RateLimitInternalLayerError);
    });

    it('should create cross layer error', () => {
      const error = RateLimitingErrorFactory.crossLayer('src', 'tgt', 'op', 'msg');
      expect(error).toBeInstanceOf(RateLimitCrossLayerError);
    });

    it('should create adaptive error', () => {
      const error = RateLimitingErrorFactory.adaptive('id', 'prediction error');
      expect(error).toBeInstanceOf(RateLimitAdaptiveError);
    });

    it('should create cascade error', () => {
      const error = RateLimitingErrorFactory.cascade('cascade-1', 'layer', 'msg');
      expect(error).toBeInstanceOf(RateLimitCascadeError);
    });
  });
});