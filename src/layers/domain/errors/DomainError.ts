/**
 * Domain Error Taxonomy
 *
 * Concrete error classes for domain-layer errors.
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
  | 'INVALID_ENTITY';

export class DomainErrorImpl extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static emptyMessage(): DomainErrorImpl {
    return new DomainErrorImpl('EMPTY_MESSAGE', 'Message content cannot be empty');
  }

  static invalidLanguage(language: string): DomainErrorImpl {
    return new DomainErrorImpl('INVALID_LANGUAGE', `Language '${language}' is not supported`, { language });
  }

  static invalidFormat(format: string): DomainErrorImpl {
    return new DomainErrorImpl('INVALID_FORMAT', `Format '${format}' is not supported`, { format });
  }

  static messageNotFound(id: string): DomainErrorImpl {
    return new DomainErrorImpl('MESSAGE_NOT_FOUND', `Message with ID '${id}' not found`, { id });
  }

  static policyViolation(reason: string): DomainErrorImpl {
    return new DomainErrorImpl('POLICY_VIOLATION', reason);
  }

  static quotaExceeded(limit: number): DomainErrorImpl {
    return new DomainErrorImpl('QUOTA_EXCEEDED', `Daily quota of ${limit} messages exceeded`, { limit });
  }

  static languageBlocked(language: string): DomainErrorImpl {
    return new DomainErrorImpl('LANGUAGE_BLOCKED', `Language '${language}' is blocked`, { language });
  }

  toJSON(): { name: string; code: string; message: string; details?: Record<string, unknown> } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
