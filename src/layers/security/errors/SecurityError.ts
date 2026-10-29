/**
 * Security Error Taxonomy
 *
 * Base error class and specific error types for the Security Layer.
 * Provides structured error handling with error codes and context.
 *
 * @module SecurityLayer/Errors
 */

export type SecurityErrorCode =
  | 'SECURITY_CONFIGURATION_ERROR'
  | 'SECURITY_EXECUTION_ERROR'
  | 'SECURITY_TIMEOUT_ERROR'
  | 'SECURITY_VALIDATION_ERROR'
  | 'SECURITY_AUTHENTICATION_ERROR'
  | 'SECURITY_AUTHORIZATION_ERROR'
  | 'SECURITY_THREAT_DETECTED'
  | 'SECURITY_RATE_LIMIT_EXCEEDED'
  | 'SECURITY_CORS_VIOLATION'
  | 'SECURITY_INVALID_CREDENTIALS'
  | 'SECURITY_SESSION_EXPIRED'
  | 'SECURITY_POLICY_VIOLATION';

export interface SecurityErrorContext {
  readonly operation?: string;
  readonly resource?: string;
  readonly userId?: string;
  readonly ipAddress?: string;
  readonly requestId?: string;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Base Security Error Class
 *
 * All security-related errors inherit from this class.
 * Provides consistent error structure with codes and context.
 */
export class SecurityError extends Error {
  public readonly code: SecurityErrorCode;
  public readonly context: SecurityErrorContext;
  public override readonly cause?: Error;
  public readonly isOperational: boolean;

  constructor(code: SecurityErrorCode, message: string, context: Partial<SecurityErrorContext> = {}, cause?: Error) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.context = {
      timestamp: Date.now(),
      ...context,
    };
    this.cause = cause;
    this.isOperational = true;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityError);
    }
  }

  /**
   * Creates a JSON-serializable representation of the error
   */
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

  /**
   * Checks if error is a specific security error code
   */
  isCode(code: SecurityErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Checks if error is operational (expected) vs programmer error
   */
  isOperationalError(): boolean {
    return this.isOperational;
  }
}

/**
 * Configuration Error
 *
 * Thrown when security configuration is invalid or missing.
 */
export class SecurityConfigurationError extends SecurityError {
  constructor(message: string, context: Partial<SecurityErrorContext> = {}, cause?: Error) {
    super('SECURITY_CONFIGURATION_ERROR', message, context, cause);
    this.name = 'SecurityConfigurationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityConfigurationError);
    }
  }

  static invalidConfig(
    field: string,
    value: unknown,
    context?: Partial<SecurityErrorContext>
  ): SecurityConfigurationError {
    return new SecurityConfigurationError(`Invalid security configuration: ${field} = ${JSON.stringify(value)}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field, value },
    });
  }

  static missingConfig(field: string, context?: Partial<SecurityErrorContext>): SecurityConfigurationError {
    return new SecurityConfigurationError(`Missing required security configuration: ${field}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field },
    });
  }
}

/**
 * Execution Error
 *
 * Thrown when a security operation fails during execution.
 */
export class SecurityExecutionError extends SecurityError {
  constructor(message: string, context: Partial<SecurityErrorContext> = {}, cause?: Error) {
    super('SECURITY_EXECUTION_ERROR', message, context, cause);
    this.name = 'SecurityExecutionError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityExecutionError);
    }
  }

  static operationFailed(
    operation: string,
    reason: string,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityExecutionError {
    return new SecurityExecutionError(
      `Security operation '${operation}' failed: ${reason}`,
      { ...context, operation, metadata: { reason } },
      cause
    );
  }

  static strategyExecutionFailed(
    strategy: string,
    reason: string,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityExecutionError {
    return new SecurityExecutionError(
      `Security strategy '${strategy}' execution failed: ${reason}`,
      { ...context, operation: 'execute-strategy', metadata: { strategy, reason } },
      cause
    );
  }
}

/**
 * Timeout Error
 *
 * Thrown when a security operation exceeds its time limit.
 */
export class SecurityTimeoutError extends SecurityError {
  public readonly timeoutMs: number;
  public readonly operation: string;

  constructor(operation: string, timeoutMs: number, context: Partial<SecurityErrorContext> = {}, cause?: Error) {
    super(
      'SECURITY_TIMEOUT_ERROR',
      `Security operation '${operation}' timed out after ${timeoutMs}ms`,
      { ...context, operation, metadata: { timeoutMs } },
      cause
    );
    this.name = 'SecurityTimeoutError';
    this.timeoutMs = timeoutMs;
    this.operation = operation;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityTimeoutError);
    }
  }

  static authenticationTimeout(timeoutMs: number, context?: Partial<SecurityErrorContext>): SecurityTimeoutError {
    return new SecurityTimeoutError('authentication', timeoutMs, context);
  }

  static authorizationTimeout(timeoutMs: number, context?: Partial<SecurityErrorContext>): SecurityTimeoutError {
    return new SecurityTimeoutError('authorization', timeoutMs, context);
  }

  static threatDetectionTimeout(timeoutMs: number, context?: Partial<SecurityErrorContext>): SecurityTimeoutError {
    return new SecurityTimeoutError('threat-detection', timeoutMs, context);
  }
}

/**
 * Validation Error
 *
 * Thrown when security validation fails.
 */
export class SecurityValidationError extends SecurityError {
  public readonly field: string;
  public readonly value: unknown;
  public readonly constraint: string;

  constructor(
    field: string,
    value: unknown,
    constraint: string,
    context: Partial<SecurityErrorContext> = {},
    cause?: Error
  ) {
    super(
      'SECURITY_VALIDATION_ERROR',
      `Security validation failed for '${field}': ${constraint}`,
      { ...context, operation: 'validate', metadata: { field, value, constraint } },
      cause
    );
    this.name = 'SecurityValidationError';
    this.field = field;
    this.value = value;
    this.constraint = constraint;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityValidationError);
    }
  }

  static invalidField(
    field: string,
    value: unknown,
    constraint: string,
    context?: Partial<SecurityErrorContext>
  ): SecurityValidationError {
    return new SecurityValidationError(field, value, constraint, context);
  }

  static missingField(field: string, context?: Partial<SecurityErrorContext>): SecurityValidationError {
    return new SecurityValidationError(field, undefined, 'field is required', context);
  }

  static invalidFormat(
    field: string,
    value: unknown,
    expectedFormat: string,
    context?: Partial<SecurityErrorContext>
  ): SecurityValidationError {
    return new SecurityValidationError(field, value, `must match format: ${expectedFormat}`, context);
  }
}

/**
 * Authentication Error
 *
 * Thrown when authentication fails.
 */
export class SecurityAuthenticationError extends SecurityError {
  public readonly authMethod: string;
  public readonly reason: string;

  constructor(authMethod: string, reason: string, context: Partial<SecurityErrorContext> = {}, cause?: Error) {
    super(
      'SECURITY_AUTHENTICATION_ERROR',
      `Authentication failed (${authMethod}): ${reason}`,
      { ...context, operation: 'authenticate', metadata: { authMethod, reason } },
      cause
    );
    this.name = 'SecurityAuthenticationError';
    this.authMethod = authMethod;
    this.reason = reason;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityAuthenticationError);
    }
  }

  static invalidCredentials(authMethod: string, context?: Partial<SecurityErrorContext>): SecurityAuthenticationError {
    return new SecurityAuthenticationError(authMethod, 'Invalid credentials', context);
  }

  static missingCredentials(authMethod: string, context?: Partial<SecurityErrorContext>): SecurityAuthenticationError {
    return new SecurityAuthenticationError(authMethod, 'Missing credentials', context);
  }

  static expiredToken(authMethod: string, context?: Partial<SecurityErrorContext>): SecurityAuthenticationError {
    return new SecurityAuthenticationError(authMethod, 'Token expired', context);
  }

  static malformedToken(authMethod: string, context?: Partial<SecurityErrorContext>): SecurityAuthenticationError {
    return new SecurityAuthenticationError(authMethod, 'Malformed token', context);
  }
}

/**
 * Authorization Error
 *
 * Thrown when authorization fails.
 */
export class SecurityAuthorizationError extends SecurityError {
  public readonly requiredPermissions: string[];
  public readonly userPermissions: string[];

  constructor(
    requiredPermissions: string[],
    userPermissions: string[],
    context: Partial<SecurityErrorContext> = {},
    cause?: Error
  ) {
    super(
      'SECURITY_AUTHORIZATION_ERROR',
      `Authorization failed: required permissions [${requiredPermissions.join(', ')}] not satisfied by user permissions [${userPermissions.join(', ')}]`,
      { ...context, operation: 'authorize', metadata: { requiredPermissions, userPermissions } },
      cause
    );
    this.name = 'SecurityAuthorizationError';
    this.requiredPermissions = requiredPermissions;
    this.userPermissions = userPermissions;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityAuthorizationError);
    }
  }

  static insufficientPermissions(
    required: string[],
    user: string[],
    context?: Partial<SecurityErrorContext>
  ): SecurityAuthorizationError {
    return new SecurityAuthorizationError(required, user, context);
  }

  static accessDenied(resource: string, context?: Partial<SecurityErrorContext>): SecurityAuthorizationError {
    return new SecurityAuthorizationError([resource], [], { ...context, resource, metadata: { resource } });
  }
}

/**
 * Threat Detected Error
 *
 * Thrown when a security threat is detected.
 */
export class SecurityThreatDetectedError extends SecurityError {
  public readonly threatType: string;
  public readonly severity: string;
  public readonly details: Record<string, unknown>;

  constructor(
    threatType: string,
    severity: string,
    details: Record<string, unknown>,
    context: Partial<SecurityErrorContext> = {},
    cause?: Error
  ) {
    super(
      'SECURITY_THREAT_DETECTED',
      `Security threat detected: ${threatType} (${severity})`,
      { ...context, operation: 'threat-detection', metadata: { threatType, severity, ...details } },
      cause
    );
    this.name = 'SecurityThreatDetectedError';
    this.threatType = threatType;
    this.severity = severity;
    this.details = details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityThreatDetectedError);
    }
  }
}

/**
 * Rate Limit Exceeded Error
 *
 * Thrown when rate limit is exceeded.
 */
export class SecurityRateLimitExceededError extends SecurityError {
  public readonly identifier: string;
  public readonly limit: number;
  public readonly windowMs: number;
  public readonly retryAfterMs: number;

  constructor(
    identifier: string,
    limit: number,
    windowMs: number,
    retryAfterMs: number,
    context: Partial<SecurityErrorContext> = {},
    cause?: Error
  ) {
    super(
      'SECURITY_RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded for ${identifier}: ${limit} requests per ${windowMs}ms`,
      { ...context, operation: 'rate-limit', metadata: { identifier, limit, windowMs, retryAfterMs } },
      cause
    );
    this.name = 'SecurityRateLimitExceededError';
    this.identifier = identifier;
    this.limit = limit;
    this.windowMs = windowMs;
    this.retryAfterMs = retryAfterMs;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityRateLimitExceededError);
    }
  }
}

/**
 * CORS Violation Error
 *
 * Thrown when CORS validation fails.
 */
export class SecurityCorsViolationError extends SecurityError {
  public readonly origin: string;
  public readonly allowedOrigins: string[];

  constructor(origin: string, allowedOrigins: string[], context: Partial<SecurityErrorContext> = {}, cause?: Error) {
    super(
      'SECURITY_CORS_VIOLATION',
      `CORS violation: origin '${origin}' not in allowed origins`,
      { ...context, operation: 'cors-validation', metadata: { origin, allowedOrigins } },
      cause
    );
    this.name = 'SecurityCorsViolationError';
    this.origin = origin;
    this.allowedOrigins = allowedOrigins;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityCorsViolationError);
    }
  }
}

/**
 * Session Expired Error
 *
 * Thrown when a session has expired.
 */
export class SecuritySessionExpiredError extends SecurityError {
  public readonly sessionId: string;
  public readonly expiredAt: number;

  constructor(sessionId: string, expiredAt: number, context: Partial<SecurityErrorContext> = {}, cause?: Error) {
    super(
      'SECURITY_SESSION_EXPIRED',
      `Session ${sessionId} expired at ${new Date(expiredAt).toISOString()}`,
      { ...context, operation: 'session-validation', metadata: { sessionId, expiredAt } },
      cause
    );
    this.name = 'SecuritySessionExpiredError';
    this.sessionId = sessionId;
    this.expiredAt = expiredAt;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecuritySessionExpiredError);
    }
  }
}

/**
 * Policy Violation Error
 *
 * Thrown when a security policy is violated.
 */
export class SecurityPolicyViolationError extends SecurityError {
  public readonly policyId: string;
  public readonly rule: string;
  public readonly action: string;

  constructor(
    policyId: string,
    rule: string,
    action: string,
    context: Partial<SecurityErrorContext> = {},
    cause?: Error
  ) {
    super(
      'SECURITY_POLICY_VIOLATION',
      `Policy violation: ${policyId} - rule '${rule}' ${action}`,
      { ...context, operation: 'policy-enforcement', metadata: { policyId, rule, action } },
      cause
    );
    this.name = 'SecurityPolicyViolationError';
    this.policyId = policyId;
    this.rule = rule;
    this.action = action;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecurityPolicyViolationError);
    }
  }
}

/**
 * Error Factory for creating security errors
 */
export class SecurityErrorFactory {
  static configuration(
    message: string,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityConfigurationError {
    return new SecurityConfigurationError(message, context, cause);
  }

  static execution(message: string, context?: Partial<SecurityErrorContext>, cause?: Error): SecurityExecutionError {
    return new SecurityExecutionError(message, context, cause);
  }

  static timeout(
    operation: string,
    timeoutMs: number,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityTimeoutError {
    return new SecurityTimeoutError(operation, timeoutMs, context, cause);
  }

  static validation(
    field: string,
    value: unknown,
    constraint: string,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityValidationError {
    return new SecurityValidationError(field, value, constraint, context, cause);
  }

  static authentication(
    authMethod: string,
    reason: string,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityAuthenticationError {
    return new SecurityAuthenticationError(authMethod, reason, context, cause);
  }

  static authorization(
    required: string[],
    user: string[],
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityAuthorizationError {
    return new SecurityAuthorizationError(required, user, context, cause);
  }

  static threatDetected(
    threatType: string,
    severity: string,
    details: Record<string, unknown>,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityThreatDetectedError {
    return new SecurityThreatDetectedError(threatType, severity, details, context, cause);
  }

  static rateLimitExceeded(
    identifier: string,
    limit: number,
    windowMs: number,
    retryAfterMs: number,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityRateLimitExceededError {
    return new SecurityRateLimitExceededError(identifier, limit, windowMs, retryAfterMs, context, cause);
  }

  static corsViolation(
    origin: string,
    allowedOrigins: string[],
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityCorsViolationError {
    return new SecurityCorsViolationError(origin, allowedOrigins, context, cause);
  }

  static sessionExpired(
    sessionId: string,
    expiredAt: number,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecuritySessionExpiredError {
    return new SecuritySessionExpiredError(sessionId, expiredAt, context, cause);
  }

  static policyViolation(
    policyId: string,
    rule: string,
    action: string,
    context?: Partial<SecurityErrorContext>,
    cause?: Error
  ): SecurityPolicyViolationError {
    return new SecurityPolicyViolationError(policyId, rule, action, context, cause);
  }
}
