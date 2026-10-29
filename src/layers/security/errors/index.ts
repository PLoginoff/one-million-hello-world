/**
 * Security Errors
 *
 * Exports all security error classes and types.
 */

export type { SecurityErrorCode, SecurityErrorContext } from './SecurityError';
export {
  SecurityError,
  SecurityConfigurationError,
  SecurityExecutionError,
  SecurityTimeoutError,
  SecurityValidationError,
  SecurityAuthenticationError,
  SecurityAuthorizationError,
  SecurityThreatDetectedError,
  SecurityRateLimitExceededError,
  SecurityCorsViolationError,
  SecuritySessionExpiredError,
  SecurityPolicyViolationError,
  SecurityErrorFactory,
} from './SecurityError';
