/**
 * Domain Error Taxonomy
 *
 * Concrete error classes for domain-layer errors.
 * Provides a structured hierarchy of domain-specific errors
 * with error codes, messages, and contextual details.
 */

export type DomainErrorCode =
  | 'EMPTY_MESSAGE'
  | 'INVALID_LANGUAGE'
  | 'INVALID_FORMAT'
  | 'MESSAGE_NOT_FOUND'
  | 'POLICY_VIOLATION'
  | 'QUOTA_EXCEEDED'
  | 'LANGUAGE_BLOCKED'
  | 'VALIDATION_FAILED'
  | 'ENTITY_NOT_FOUND'
  | 'INVALID_ENTITY'
  | 'ENTITY_VALIDATION_ERROR'
  | 'POLICY_VIOLATION_ERROR'
  | 'DOMAIN_CONFIGURATION_ERROR'
  | 'CONCURRENCY_CONFLICT'
  | 'EVENT_STORE_ERROR'
  | 'AGGREGATE_NOT_FOUND';

/**
 * Base class for all domain errors.
 * Provides structured error information with codes and details.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;
  readonly timestamp: Date;
  readonly correlationId?: string;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>, correlationId?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
    this.correlationId = correlationId;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static emptyMessage(correlationId?: string): DomainError {
    return new DomainError('EMPTY_MESSAGE', 'Message content cannot be empty', undefined, correlationId);
  }

  static invalidLanguage(language: string, correlationId?: string): DomainError {
    return new DomainError('INVALID_LANGUAGE', `Language '${language}' is not supported`, { language }, correlationId);
  }

  static invalidFormat(format: string, correlationId?: string): DomainError {
    return new DomainError('INVALID_FORMAT', `Format '${format}' is not supported`, { format }, correlationId);
  }

  static messageNotFound(id: string, correlationId?: string): DomainError {
    return new DomainError('MESSAGE_NOT_FOUND', `Message with ID '${id}' not found`, { id }, correlationId);
  }

  static policyViolation(reason: string, correlationId?: string): DomainError {
    return new DomainError('POLICY_VIOLATION', reason, undefined, correlationId);
  }

  static quotaExceeded(limit: number, correlationId?: string): DomainError {
    return new DomainError('QUOTA_EXCEEDED', `Daily quota of ${limit} messages exceeded`, { limit }, correlationId);
  }

  static languageBlocked(language: string, correlationId?: string): DomainError {
    return new DomainError('LANGUAGE_BLOCKED', `Language '${language}' is blocked`, { language }, correlationId);
  }

  static validationFailed(field: string, reason: string, correlationId?: string): DomainError {
    return new DomainError(
      'VALIDATION_FAILED',
      `Validation failed for ${field}: ${reason}`,
      { field, reason },
      correlationId
    );
  }

  static entityNotFound(entityId: string, entityType: string, correlationId?: string): DomainError {
    return new DomainError(
      'ENTITY_NOT_FOUND',
      `${entityType} with ID '${entityId}' not found`,
      { entityId, entityType },
      correlationId
    );
  }

  static invalidEntity(reason: string, correlationId?: string): DomainError {
    return new DomainError('INVALID_ENTITY', `Invalid entity: ${reason}`, { reason }, correlationId);
  }

  static concurrencyConflict(
    entityId: string,
    expectedVersion: number,
    actualVersion: number,
    correlationId?: string
  ): DomainError {
    return new DomainError(
      'CONCURRENCY_CONFLICT',
      `Concurrency conflict for entity '${entityId}': expected version ${expectedVersion}, found ${actualVersion}`,
      { entityId, expectedVersion, actualVersion },
      correlationId
    );
  }

  static eventStoreError(operation: string, reason: string, correlationId?: string): DomainError {
    return new DomainError(
      'EVENT_STORE_ERROR',
      `Event store ${operation} failed: ${reason}`,
      { operation, reason },
      correlationId
    );
  }

  static aggregateNotFound(aggregateId: string, correlationId?: string): DomainError {
    return new DomainError(
      'AGGREGATE_NOT_FOUND',
      `Aggregate with ID '${aggregateId}' not found`,
      { aggregateId },
      correlationId
    );
  }

  toJSON(): {
    name: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    correlationId?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
    };
  }
}

/**
 * Error raised when entity validation fails.
 * Contains detailed validation error information.
 */
export class EntityValidationError extends DomainError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    message: string,
    fieldErrors: Record<string, string[]>,
    details?: Record<string, unknown>,
    correlationId?: string
  ) {
    super('ENTITY_VALIDATION_ERROR', message, details, correlationId);
    this.name = 'EntityValidationError';
    this.fieldErrors = fieldErrors;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static fromValidationResult(
    entityId: string,
    fieldErrors: Record<string, string[]>,
    correlationId?: string
  ): EntityValidationError {
    const errorCount = Object.values(fieldErrors).reduce((sum, errors) => sum + errors.length, 0);
    const message = `Entity '${entityId}' failed validation with ${errorCount} error(s)`;
    return new EntityValidationError(message, fieldErrors, { entityId }, correlationId);
  }

  getFieldErrors(field: string): string[] {
    return this.fieldErrors[field] ?? [];
  }

  hasFieldErrors(field: string): boolean {
    return (this.fieldErrors[field]?.length ?? 0) > 0;
  }

  getAllErrors(): string[] {
    return Object.entries(this.fieldErrors).flatMap(([field, errors]) => errors.map((error) => `${field}: ${error}`));
  }

  override toJSON(): {
    name: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    correlationId?: string;
    fieldErrors: Record<string, string[]>;
  } {
    return {
      ...super.toJSON(),
      fieldErrors: this.fieldErrors,
    };
  }
}

/**
 * Error raised when a domain policy is violated.
 * Contains policy-specific violation details.
 */
export class PolicyViolationError extends DomainError {
  readonly policyName: string;
  readonly violationType: string;
  readonly entityId?: string;

  constructor(
    policyName: string,
    violationType: string,
    message: string,
    entityId?: string,
    details?: Record<string, unknown>,
    correlationId?: string
  ) {
    super('POLICY_VIOLATION_ERROR', message, details, correlationId);
    this.name = 'PolicyViolationError';
    this.policyName = policyName;
    this.violationType = violationType;
    this.entityId = entityId;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static blockedLanguage(
    policyName: string,
    language: string,
    entityId?: string,
    correlationId?: string
  ): PolicyViolationError {
    return new PolicyViolationError(
      policyName,
      'BLOCKED_LANGUAGE',
      `Language '${language}' is blocked by policy '${policyName}'`,
      entityId,
      { language },
      correlationId
    );
  }

  static quotaExceededPolicy(
    policyName: string,
    limit: number,
    currentCount: number,
    entityId?: string,
    correlationId?: string
  ): PolicyViolationError {
    return new PolicyViolationError(
      policyName,
      'QUOTA_EXCEEDED',
      `Daily quota of ${limit} messages exceeded (current: ${currentCount})`,
      entityId,
      { limit, currentCount },
      correlationId
    );
  }

  static formatNotAllowed(
    policyName: string,
    format: string,
    entityId?: string,
    correlationId?: string
  ): PolicyViolationError {
    return new PolicyViolationError(
      policyName,
      'FORMAT_NOT_ALLOWED',
      `Format '${format}' is not allowed by policy '${policyName}'`,
      entityId,
      { format },
      correlationId
    );
  }

  static customRuleViolation(
    policyName: string,
    ruleName: string,
    message: string,
    entityId?: string,
    correlationId?: string
  ): PolicyViolationError {
    return new PolicyViolationError(
      policyName,
      'CUSTOM_RULE_VIOLATION',
      `Rule '${ruleName}' violated: ${message}`,
      entityId,
      { ruleName },
      correlationId
    );
  }

  override toJSON(): {
    name: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    correlationId?: string;
    policyName: string;
    violationType: string;
    entityId?: string;
  } {
    return {
      ...super.toJSON(),
      policyName: this.policyName,
      violationType: this.violationType,
      entityId: this.entityId,
    };
  }
}

/**
 * Error raised when an entity is not found.
 * Provides entity type and ID for debugging.
 */
export class EntityNotFoundError extends DomainError {
  readonly entityId: string;
  readonly entityType: string;

  constructor(entityType: string, entityId: string, correlationId?: string) {
    super('ENTITY_NOT_FOUND', `${entityType} with ID '${entityId}' not found`, { entityId, entityType }, correlationId);
    this.name = 'EntityNotFoundError';
    this.entityId = entityId;
    this.entityType = entityType;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static forEntity<T extends { id: string }>(
    entityType: string,
    entityId: string,
    correlationId?: string
  ): EntityNotFoundError {
    return new EntityNotFoundError(entityType, entityId, correlationId);
  }

  override toJSON(): {
    name: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    correlationId?: string;
    entityId: string;
    entityType: string;
  } {
    return {
      ...super.toJSON(),
      entityId: this.entityId,
      entityType: this.entityType,
    };
  }
}

/**
 * Error raised when domain configuration is invalid.
 * Contains configuration validation details.
 */
export class DomainConfigurationError extends DomainError {
  readonly configKey: string;
  readonly configValue: unknown;
  readonly validationErrors: string[];

  constructor(configKey: string, configValue: unknown, validationErrors: string[], correlationId?: string) {
    const message = `Invalid configuration for '${configKey}': ${validationErrors.join('; ')}`;
    super('DOMAIN_CONFIGURATION_ERROR', message, { configKey, configValue, validationErrors }, correlationId);
    this.name = 'DomainConfigurationError';
    this.configKey = configKey;
    this.configValue = configValue;
    this.validationErrors = validationErrors;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static fromValidationResult(
    configKey: string,
    configValue: unknown,
    validationErrors: string[],
    correlationId?: string
  ): DomainConfigurationError {
    return new DomainConfigurationError(configKey, configValue, validationErrors, correlationId);
  }

  override toJSON(): {
    name: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    correlationId?: string;
    configKey: string;
    configValue: unknown;
    validationErrors: string[];
  } {
    return {
      ...super.toJSON(),
      configKey: this.configKey,
      configValue: this.configValue,
      validationErrors: this.validationErrors,
    };
  }
}

/**
 * Error raised when a concurrency conflict occurs during entity update.
 */
export class ConcurrencyConflictError extends DomainError {
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(entityId: string, expectedVersion: number, actualVersion: number, correlationId?: string) {
    super(
      'CONCURRENCY_CONFLICT',
      `Concurrency conflict for entity '${entityId}': expected version ${expectedVersion}, found ${actualVersion}`,
      { entityId, expectedVersion, actualVersion },
      correlationId
    );
    this.name = 'ConcurrencyConflictError';
    this.entityId = entityId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  override toJSON(): {
    name: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    correlationId?: string;
    entityId: string;
    expectedVersion: number;
    actualVersion: number;
  } {
    return {
      ...super.toJSON(),
      entityId: this.entityId,
      expectedVersion: this.expectedVersion,
      actualVersion: this.actualVersion,
    };
  }
}

/**
 * Type guard to check if an error is a DomainError.
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Type guard to check if an error is an EntityValidationError.
 */
export function isEntityValidationError(error: unknown): error is EntityValidationError {
  return error instanceof EntityValidationError;
}

/**
 * Type guard to check if an error is a PolicyViolationError.
 */
export function isPolicyViolationError(error: unknown): error is PolicyViolationError {
  return error instanceof PolicyViolationError;
}

/**
 * Type guard to check if an error is an EntityNotFoundError.
 */
export function isEntityNotFoundError(error: unknown): error is EntityNotFoundError {
  return error instanceof EntityNotFoundError;
}

/**
 * Type guard to check if an error is a DomainConfigurationError.
 */
export function isDomainConfigurationError(error: unknown): error is DomainConfigurationError {
  return error instanceof DomainConfigurationError;
}

/**
 * Type guard to check if an error is a ConcurrencyConflictError.
 */
export function isConcurrencyConflictError(error: unknown): error is ConcurrencyConflictError {
  return error instanceof ConcurrencyConflictError;
}
