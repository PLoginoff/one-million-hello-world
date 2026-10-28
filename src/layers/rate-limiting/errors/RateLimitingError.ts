/**
 * Rate Limiting Error Taxonomy
 *
 * Base error class and specific error types for the Rate Limiting Layer.
 * Provides structured error handling with error codes and context.
 *
 * @module RateLimitingLayer/Errors
 */

export type RateLimitingErrorCode =
  | 'RATE_LIMIT_CONFIGURATION_ERROR'
  | 'RATE_LIMIT_EXECUTION_ERROR'
  | 'RATE_LIMIT_TIMEOUT_ERROR'
  | 'RATE_LIMIT_VALIDATION_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_BUCKET_NOT_FOUND'
  | 'RATE_LIMIT_INVALID_IDENTIFIER'
  | 'RATE_LIMIT_RULE_CONFLICT'
  | 'RATE_LIMIT_QUOTA_EXHAUSTED'
  | 'RATE_LIMIT_TIER_NOT_FOUND'
  | 'RATE_LIMIT_INTERNAL_LAYER_ERROR'
  | 'RATE_LIMIT_CROSS_LAYER_ERROR'
  | 'RATE_LIMIT_ADAPTIVE_ERROR'
  | 'RATE_LIMIT_CASCADE_ERROR';

export interface RateLimitingErrorContext {
  readonly operation?: string;
  readonly identifier?: string;
  readonly layer?: string;
  readonly ruleId?: string;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Base Rate Limiting Error Class
 *
 * All rate limiting-related errors inherit from this class.
 * Provides consistent error structure with codes and context.
 */
export class RateLimitingError extends Error {
  public readonly code: RateLimitingErrorCode;
  public readonly context: RateLimitingErrorContext;
  public readonly cause?: Error;
  public readonly isOperational: boolean;

  constructor(
    code: RateLimitingErrorCode,
    message: string,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(message);
    this.name = 'RateLimitingError';
    this.code = code;
    this.context = {
      timestamp: Date.now(),
      ...context,
    };
    this.cause = cause;
    this.isOperational = true;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitingError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
      isOperational: this.isOperational,
    };
  }

  isCode(code: RateLimitingErrorCode): boolean {
    return this.code === code;
  }

  isOperationalError(): boolean {
    return this.isOperational;
  }
}

/**
 * Configuration Error
 *
 * Thrown when rate limiting configuration is invalid or missing.
 */
export class RateLimitingConfigurationError extends RateLimitingError {
  constructor(message: string, context: Partial<RateLimitingErrorContext> = {}, cause?: Error) {
    super('RATE_LIMIT_CONFIGURATION_ERROR', message, context, cause);
    this.name = 'RateLimitingConfigurationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitingConfigurationError);
    }
  }

  static invalidConfig(
    field: string,
    value: unknown,
    context?: Partial<RateLimitingErrorContext>
  ): RateLimitingConfigurationError {
    return new RateLimitingConfigurationError(`Invalid rate limit configuration: ${field} = ${JSON.stringify(value)}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field, value },
    });
  }

  static missingConfig(field: string, context?: Partial<RateLimitingErrorContext>): RateLimitingConfigurationError {
    return new RateLimitingConfigurationError(`Missing required rate limit configuration: ${field}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field },
    });
  }

  static invalidAlgorithm(
    algorithm: string,
    context?: Partial<RateLimitingErrorContext>
  ): RateLimitingConfigurationError {
    return new RateLimitingConfigurationError(`Invalid rate limit algorithm: ${algorithm}`, {
      ...context,
      operation: 'validate-config',
      metadata: { algorithm },
    });
  }

  static invalidWindow(window: number, context?: Partial<RateLimitingErrorContext>): RateLimitingConfigurationError {
    return new RateLimitingConfigurationError(`Invalid rate limit window: ${window}ms`, {
      ...context,
      operation: 'validate-config',
      metadata: { window },
    });
  }
}

/**
 * Execution Error
 *
 * Thrown when a rate limiting operation fails during execution.
 */
export class RateLimitingExecutionError extends RateLimitingError {
  constructor(message: string, context: Partial<RateLimitingErrorContext> = {}, cause?: Error) {
    super('RATE_LIMIT_EXECUTION_ERROR', message, context, cause);
    this.name = 'RateLimitingExecutionError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitingExecutionError);
    }
  }

  static operationFailed(
    operation: string,
    reason: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitingExecutionError {
    return new RateLimitingExecutionError(
      `Rate limit operation '${operation}' failed: ${reason}`,
      { ...context, operation, metadata: { reason } },
      cause
    );
  }

  static strategyExecutionFailed(
    strategy: string,
    reason: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitingExecutionError {
    return new RateLimitingExecutionError(
      `Rate limit strategy '${strategy}' execution failed: ${reason}`,
      { ...context, operation: 'execute-strategy', metadata: { strategy, reason } },
      cause
    );
  }

  static bucketOperationFailed(
    operation: string,
    identifier: string,
    reason: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitingExecutionError {
    return new RateLimitingExecutionError(
      `Bucket operation '${operation}' failed for ${identifier}: ${reason}`,
      { ...context, operation, identifier, metadata: { reason } },
      cause
    );
  }
}

/**
 * Timeout Error
 *
 * Thrown when a rate limiting operation exceeds its time limit.
 */
export class RateLimitingTimeoutError extends RateLimitingError {
  public readonly timeoutMs: number;
  public readonly operation: string;

  constructor(operation: string, timeoutMs: number, context: Partial<RateLimitingErrorContext> = {}, cause?: Error) {
    super(
      'RATE_LIMIT_TIMEOUT_ERROR',
      `Rate limit operation '${operation}' timed out after ${timeoutMs}ms`,
      { ...context, operation, metadata: { timeoutMs } },
      cause
    );
    this.name = 'RateLimitingTimeoutError';
    this.timeoutMs = timeoutMs;
    this.operation = operation;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitingTimeoutError);
    }
  }

  static checkTimeout(timeoutMs: number, context?: Partial<RateLimitingErrorContext>): RateLimitingTimeoutError {
    return new RateLimitingTimeoutError('check-rate-limit', timeoutMs, context);
  }

  static bucketOperationTimeout(
    operation: string,
    timeoutMs: number,
    context?: Partial<RateLimitingErrorContext>
  ): RateLimitingTimeoutError {
    return new RateLimitingTimeoutError(`bucket-${operation}`, timeoutMs, context);
  }

  static cleanupTimeout(timeoutMs: number, context?: Partial<RateLimitingErrorContext>): RateLimitingTimeoutError {
    return new RateLimitingTimeoutError('cleanup-expired-buckets', timeoutMs, context);
  }
}

/**
 * Validation Error
 *
 * Thrown when rate limiting validation fails.
 */
export class RateLimitingValidationError extends RateLimitingError {
  public readonly field: string;
  public readonly value: unknown;
  public readonly constraint: string;

  constructor(
    field: string,
    value: unknown,
    constraint: string,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_VALIDATION_ERROR',
      `Rate limit validation failed for '${field}': ${constraint}`,
      { ...context, operation: 'validate', metadata: { field, value, constraint } },
      cause
    );
    this.name = 'RateLimitingValidationError';
    this.field = field;
    this.value = value;
    this.constraint = constraint;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitingValidationError);
    }
  }

  static invalidField(
    field: string,
    value: unknown,
    constraint: string,
    context?: Partial<RateLimitingErrorContext>
  ): RateLimitingValidationError {
    return new RateLimitingValidationError(field, value, constraint, context);
  }

  static missingField(field: string, context?: Partial<RateLimitingErrorContext>): RateLimitingValidationError {
    return new RateLimitingValidationError(field, undefined, 'field is required', context);
  }

  static invalidIdentifier(
    identifier: string,
    reason: string,
    context?: Partial<RateLimitingErrorContext>
  ): RateLimitingValidationError {
    return new RateLimitingValidationError('identifier', identifier, reason, context);
  }

  static invalidLimit(limit: number, context?: Partial<RateLimitingErrorContext>): RateLimitingValidationError {
    return new RateLimitingValidationError('limit', limit, 'must be a positive integer', context);
  }

  static invalidWindow(window: number, context?: Partial<RateLimitingErrorContext>): RateLimitingValidationError {
    return new RateLimitingValidationError('window', window, 'must be a positive integer in milliseconds', context);
  }
}

/**
 * Rate Limit Exceeded Error
 *
 * Thrown when rate limit is exceeded.
 */
export class RateLimitExceededError extends RateLimitingError {
  public readonly identifier: string;
  public readonly limit: number;
  public readonly windowMs: number;
  public readonly currentCount: number;
  public readonly retryAfterMs: number;
  public readonly resetTime: number;

  constructor(
    identifier: string,
    limit: number,
    windowMs: number,
    currentCount: number,
    retryAfterMs: number,
    resetTime: number,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded for ${identifier}: ${currentCount}/${limit} requests in ${windowMs}ms window`,
      {
        ...context,
        operation: 'check-rate-limit',
        identifier,
        metadata: { limit, windowMs, currentCount, retryAfterMs, resetTime },
      },
      cause
    );
    this.name = 'RateLimitExceededError';
    this.identifier = identifier;
    this.limit = limit;
    this.windowMs = windowMs;
    this.currentCount = currentCount;
    this.retryAfterMs = retryAfterMs;
    this.resetTime = resetTime;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitExceededError);
    }
  }

  static fromBucketInfo(
    identifier: string,
    limit: number,
    windowMs: number,
    currentCount: number,
    resetTime: number,
    context?: Partial<RateLimitingErrorContext>
  ): RateLimitExceededError {
    const retryAfterMs = Math.max(0, resetTime - Date.now());
    return new RateLimitExceededError(identifier, limit, windowMs, currentCount, retryAfterMs, resetTime, context);
  }
}

/**
 * Bucket Not Found Error
 *
 * Thrown when a rate limit bucket is not found.
 */
export class RateLimitBucketNotFoundError extends RateLimitingError {
  public readonly identifier: string;

  constructor(identifier: string, context: Partial<RateLimitingErrorContext> = {}, cause?: Error) {
    super(
      'RATE_LIMIT_BUCKET_NOT_FOUND',
      `Rate limit bucket not found for identifier: ${identifier}`,
      { ...context, operation: 'get-bucket', identifier, metadata: { identifier } },
      cause
    );
    this.name = 'RateLimitBucketNotFoundError';
    this.identifier = identifier;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitBucketNotFoundError);
    }
  }
}

/**
 * Invalid Identifier Error
 *
 * Thrown when a rate limit identifier is invalid.
 */
export class RateLimitInvalidIdentifierError extends RateLimitingError {
  public readonly identifier: string;
  public readonly reason: string;

  constructor(identifier: string, reason: string, context: Partial<RateLimitingErrorContext> = {}, cause?: Error) {
    super(
      'RATE_LIMIT_INVALID_IDENTIFIER',
      `Invalid rate limit identifier '${identifier}': ${reason}`,
      { ...context, operation: 'validate-identifier', identifier, metadata: { reason } },
      cause
    );
    this.name = 'RateLimitInvalidIdentifierError';
    this.identifier = identifier;
    this.reason = reason;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitInvalidIdentifierError);
    }
  }

  static emptyIdentifier(context?: Partial<RateLimitingErrorContext>): RateLimitInvalidIdentifierError {
    return new RateLimitInvalidIdentifierError('', 'identifier cannot be empty', context);
  }

  static malformedIdentifier(
    identifier: string,
    context?: Partial<RateLimitingErrorContext>
  ): RateLimitInvalidIdentifierError {
    return new RateLimitInvalidIdentifierError(identifier, 'identifier contains invalid characters', context);
  }
}

/**
 * Rule Conflict Error
 *
 * Thrown when rate limit rules conflict.
 */
export class RateLimitRuleConflictError extends RateLimitingError {
  public readonly ruleId: string;
  public readonly conflictingRuleId: string;
  public readonly reason: string;

  constructor(
    ruleId: string,
    conflictingRuleId: string,
    reason: string,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_RULE_CONFLICT',
      `Rate limit rule conflict: ${ruleId} conflicts with ${conflictingRuleId}: ${reason}`,
      { ...context, operation: 'add-rule', ruleId, metadata: { conflictingRuleId, reason } },
      cause
    );
    this.name = 'RateLimitRuleConflictError';
    this.ruleId = ruleId;
    this.conflictingRuleId = conflictingRuleId;
    this.reason = reason;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitRuleConflictError);
    }
  }
}

/**
 * Quota Exhausted Error
 *
 * Thrown when a rate limit quota is exhausted.
 */
export class RateLimitQuotaExhaustedError extends RateLimitingError {
  public readonly identifier: string;
  public readonly quota: number;
  public readonly used: number;
  public readonly resetTime: number;

  constructor(
    identifier: string,
    quota: number,
    used: number,
    resetTime: number,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_QUOTA_EXHAUSTED',
      `Rate limit quota exhausted for ${identifier}: ${used}/${quota} used`,
      { ...context, operation: 'check-quota', identifier, metadata: { quota, used, resetTime } },
      cause
    );
    this.name = 'RateLimitQuotaExhaustedError';
    this.identifier = identifier;
    this.quota = quota;
    this.used = used;
    this.resetTime = resetTime;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitQuotaExhaustedError);
    }
  }
}

/**
 * Tier Not Found Error
 *
 * Thrown when a rate limit tier is not found.
 */
export class RateLimitTierNotFoundError extends RateLimitingError {
  public readonly tier: string;

  constructor(tier: string, context: Partial<RateLimitingErrorContext> = {}, cause?: Error) {
    super(
      'RATE_LIMIT_TIER_NOT_FOUND',
      `Rate limit tier not found: ${tier}`,
      { ...context, operation: 'get-tier', metadata: { tier } },
      cause
    );
    this.name = 'RateLimitTierNotFoundError';
    this.tier = tier;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitTierNotFoundError);
    }
  }
}

/**
 * Internal Layer Error
 *
 * Thrown when an internal layer rate limiting error occurs.
 */
export class RateLimitInternalLayerError extends RateLimitingError {
  public readonly layer: string;
  public readonly operation: string;

  constructor(
    layer: string,
    operation: string,
    message: string,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_INTERNAL_LAYER_ERROR',
      `Internal layer rate limit error (${layer}.${operation}): ${message}`,
      { ...context, operation, layer, metadata: { operation } },
      cause
    );
    this.name = 'RateLimitInternalLayerError';
    this.layer = layer;
    this.operation = operation;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitInternalLayerError);
    }
  }
}

/**
 * Cross Layer Error
 *
 * Thrown when a cross-layer rate limiting error occurs.
 */
export class RateLimitCrossLayerError extends RateLimitingError {
  public readonly sourceLayer: string;
  public readonly targetLayer: string;
  public readonly operation: string;

  constructor(
    sourceLayer: string,
    targetLayer: string,
    operation: string,
    message: string,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_CROSS_LAYER_ERROR',
      `Cross-layer rate limit error (${sourceLayer} -> ${targetLayer}.${operation}): ${message}`,
      { ...context, operation, layer: sourceLayer, metadata: { sourceLayer, targetLayer, operation } },
      cause
    );
    this.name = 'RateLimitCrossLayerError';
    this.sourceLayer = sourceLayer;
    this.targetLayer = targetLayer;
    this.operation = operation;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitCrossLayerError);
    }
  }
}

/**
 * Adaptive Rate Limit Error
 *
 * Thrown when adaptive rate limiting fails.
 */
export class RateLimitAdaptiveError extends RateLimitingError {
  public readonly identifier: string;
  public readonly predictionError: string;

  constructor(
    identifier: string,
    predictionError: string,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_ADAPTIVE_ERROR',
      `Adaptive rate limit error for ${identifier}: ${predictionError}`,
      { ...context, operation: 'predict-usage', identifier, metadata: { predictionError } },
      cause
    );
    this.name = 'RateLimitAdaptiveError';
    this.identifier = identifier;
    this.predictionError = predictionError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitAdaptiveError);
    }
  }
}

/**
 * Cascade Error
 *
 * Thrown when rate limit cascade fails.
 */
export class RateLimitCascadeError extends RateLimitingError {
  public readonly cascadeId: string;
  public readonly failedLayer: string;

  constructor(
    cascadeId: string,
    failedLayer: string,
    message: string,
    context: Partial<RateLimitingErrorContext> = {},
    cause?: Error
  ) {
    super(
      'RATE_LIMIT_CASCADE_ERROR',
      `Rate limit cascade error (${cascadeId}) at layer ${failedLayer}: ${message}`,
      { ...context, operation: 'cascade', layer: failedLayer, metadata: { cascadeId, failedLayer } },
      cause
    );
    this.name = 'RateLimitCascadeError';
    this.cascadeId = cascadeId;
    this.failedLayer = failedLayer;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RateLimitCascadeError);
    }
  }
}

/**
 * Error Factory for creating rate limiting errors
 */
export class RateLimitingErrorFactory {
  static configuration(
    message: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitingConfigurationError {
    return new RateLimitingConfigurationError(message, context, cause);
  }

  static execution(
    message: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitingExecutionError {
    return new RateLimitingExecutionError(message, context, cause);
  }

  static timeout(
    operation: string,
    timeoutMs: number,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitingTimeoutError {
    return new RateLimitingTimeoutError(operation, timeoutMs, context, cause);
  }

  static validation(
    field: string,
    value: unknown,
    constraint: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitingValidationError {
    return new RateLimitingValidationError(field, value, constraint, context, cause);
  }

  static rateLimitExceeded(
    identifier: string,
    limit: number,
    windowMs: number,
    currentCount: number,
    retryAfterMs: number,
    resetTime: number,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitExceededError {
    return new RateLimitExceededError(
      identifier,
      limit,
      windowMs,
      currentCount,
      retryAfterMs,
      resetTime,
      context,
      cause
    );
  }

  static bucketNotFound(
    identifier: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitBucketNotFoundError {
    return new RateLimitBucketNotFoundError(identifier, context, cause);
  }

  static invalidIdentifier(
    identifier: string,
    reason: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitInvalidIdentifierError {
    return new RateLimitInvalidIdentifierError(identifier, reason, context, cause);
  }

  static ruleConflict(
    ruleId: string,
    conflictingRuleId: string,
    reason: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitRuleConflictError {
    return new RateLimitRuleConflictError(ruleId, conflictingRuleId, reason, context, cause);
  }

  static quotaExhausted(
    identifier: string,
    quota: number,
    used: number,
    resetTime: number,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitQuotaExhaustedError {
    return new RateLimitQuotaExhaustedError(identifier, quota, used, resetTime, context, cause);
  }

  static tierNotFound(
    tier: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitTierNotFoundError {
    return new RateLimitTierNotFoundError(tier, context, cause);
  }

  static internalLayer(
    layer: string,
    operation: string,
    message: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitInternalLayerError {
    return new RateLimitInternalLayerError(layer, operation, message, context, cause);
  }

  static crossLayer(
    sourceLayer: string,
    targetLayer: string,
    operation: string,
    message: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitCrossLayerError {
    return new RateLimitCrossLayerError(sourceLayer, targetLayer, operation, message, context, cause);
  }

  static adaptive(
    identifier: string,
    predictionError: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitAdaptiveError {
    return new RateLimitAdaptiveError(identifier, predictionError, context, cause);
  }

  static cascade(
    cascadeId: string,
    failedLayer: string,
    message: string,
    context?: Partial<RateLimitingErrorContext>,
    cause?: Error
  ): RateLimitCascadeError {
    return new RateLimitCascadeError(cascadeId, failedLayer, message, context, cause);
  }
}
