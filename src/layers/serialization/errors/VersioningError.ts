/**
 * Versioning Error
 * 
 * Error thrown when versioning operations fail.
 */

import { BaseSerializationError } from './BaseSerializationError';

export class VersioningError extends BaseSerializationError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super('VERSIONING_ERROR', message, context, cause);
  }

  /**
   * Creates error for unsupported version
   */
  static unsupportedVersion(version: string): VersioningError {
    return new VersioningError(
      `Unsupported version: ${version}`,
      { version }
    );
  }

  /**
   * Creates error for version mismatch
   */
  static versionMismatch(expected: string, actual: string): VersioningError {
    return new VersioningError(
      `Version mismatch: expected ${expected}, got ${actual}`,
      { expected, actual }
    );
  }

  /**
   * Creates error for version parsing failure
   */
  static parseFailed(version: string, cause?: Error): VersioningError {
    return new VersioningError(
      `Failed to parse version: ${version}`,
      { version },
      cause
    );
  }

  /**
   * Creates error for version migration failure
   */
  static migrationFailed(from: string, to: string, cause?: Error): VersioningError {
    return new VersioningError(
      `Version migration failed from ${from} to ${to}`,
      { from, to },
      cause
    );
  }
}
