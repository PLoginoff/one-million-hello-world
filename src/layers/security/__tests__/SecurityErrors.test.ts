/**
 * Security Errors Tests
 */

import {
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
  SecurityErrorCode,
} from '../errors';

describe('SecurityError', () => {
  describe('Base SecurityError', () => {
    it('should create error with code and message', () => {
      const error = new SecurityError('SECURITY_CONFIGURATION_ERROR', 'Test error');
      expect(error.code).toBe('SECURITY_CONFIGURATION_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('SecurityError');
      expect(error.isOperational).toBe(true);
      expect(error.context.timestamp).toBeDefined();
    });

    it('should include context', () => {
      const error = new SecurityError('SECURITY_CONFIGURATION_ERROR', 'Test', {
        operation: 'test-op',
        userId: 'user-123',
      });
      expect(error.context.operation).toBe('test-op');
      expect(error.context.userId).toBe('user-123');
    });

    it('should include cause', () => {
      const cause = new Error('Original error');
      const error = new SecurityError('SECURITY_CONFIGURATION_ERROR', 'Test', {}, cause);
      expect(error.cause).toBe(cause);
    });

    it('should serialize to JSON', () => {
      const error = new SecurityError('SECURITY_CONFIGURATION_ERROR', 'Test', { operation: 'test' });
      const json = error.toJSON();
      expect(json.name).toBe('SecurityError');
      expect(json.code).toBe('SECURITY_CONFIGURATION_ERROR');
      expect(json.message).toBe('Test');
      expect(json.context.operation).toBe('test');
    });

    it('should check error code', () => {
      const error = new SecurityError('SECURITY_CONFIGURATION_ERROR', 'Test');
      expect(error.isCode('SECURITY_CONFIGURATION_ERROR')).toBe(true);
      expect(error.isCode('SECURITY_EXECUTION_ERROR')).toBe(false);
    });
  });

  describe('SecurityConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new SecurityConfigurationError('Invalid config');
      expect(error.code).toBe('SECURITY_CONFIGURATION_ERROR');
      expect(error.name).toBe('SecurityConfigurationError');
    });

    it('should create invalid config error', () => {
      const error = SecurityConfigurationError.invalidConfig('maxFailedAttempts', -1);
      expect(error.message).toContain('maxFailedAttempts');
      expect(error.context.metadata?.field).toBe('maxFailedAttempts');
      expect(error.context.metadata?.value).toBe(-1);
    });

    it('should create missing config error', () => {
      const error = SecurityConfigurationError.missingConfig('secretKey');
      expect(error.message).toContain('secretKey');
      expect(error.context.metadata?.field).toBe('secretKey');
    });
  });

  describe('SecurityExecutionError', () => {
    it('should create execution error', () => {
      const error = new SecurityExecutionError('Operation failed');
      expect(error.code).toBe('SECURITY_EXECUTION_ERROR');
      expect(error.name).toBe('SecurityExecutionError');
    });

    it('should create operation failed error', () => {
      const error = SecurityExecutionError.operationFailed('authenticate', 'Invalid token');
      expect(error.message).toContain('authenticate');
      expect(error.message).toContain('Invalid token');
      expect(error.context.operation).toBe('authenticate');
    });

    it('should create strategy execution failed error', () => {
      const error = SecurityExecutionError.strategyExecutionFailed('jwt', 'Token expired');
      expect(error.message).toContain('jwt');
      expect(error.context.metadata?.strategy).toBe('jwt');
    });
  });

  describe('SecurityTimeoutError', () => {
    it('should create timeout error', () => {
      const error = new SecurityTimeoutError('authenticate', 5000);
      expect(error.code).toBe('SECURITY_TIMEOUT_ERROR');
      expect(error.name).toBe('SecurityTimeoutError');
      expect(error.timeoutMs).toBe(5000);
      expect(error.operation).toBe('authenticate');
    });

    it('should create authentication timeout', () => {
      const error = SecurityTimeoutError.authenticationTimeout(3000);
      expect(error.operation).toBe('authentication');
      expect(error.timeoutMs).toBe(3000);
    });

    it('should create authorization timeout', () => {
      const error = SecurityTimeoutError.authorizationTimeout(2000);
      expect(error.operation).toBe('authorization');
    });

    it('should create threat detection timeout', () => {
      const error = SecurityTimeoutError.threatDetectionTimeout(1000);
      expect(error.operation).toBe('threat-detection');
    });
  });

  describe('SecurityValidationError', () => {
    it('should create validation error', () => {
      const error = new SecurityValidationError('field', 'value', 'must be positive');
      expect(error.code).toBe('SECURITY_VALIDATION_ERROR');
      expect(error.name).toBe('SecurityValidationError');
      expect(error.field).toBe('field');
      expect(error.value).toBe('value');
      expect(error.constraint).toBe('must be positive');
    });

    it('should create invalid field error', () => {
      const error = SecurityValidationError.invalidField('age', -1, 'must be positive');
      expect(error.field).toBe('age');
      expect(error.value).toBe(-1);
    });

    it('should create missing field error', () => {
      const error = SecurityValidationError.missingField('email');
      expect(error.field).toBe('email');
      expect(error.value).toBeUndefined();
      expect(error.constraint).toBe('field is required');
    });

    it('should create invalid format error', () => {
      const error = SecurityValidationError.invalidFormat('email', 'invalid', 'email format');
      expect(error.constraint).toBe('must match format: email format');
    });
  });

  describe('SecurityAuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new SecurityAuthenticationError('jwt', 'Token expired');
      expect(error.code).toBe('SECURITY_AUTHENTICATION_ERROR');
      expect(error.name).toBe('SecurityAuthenticationError');
      expect(error.authMethod).toBe('jwt');
      expect(error.reason).toBe('Token expired');
    });

    it('should create invalid credentials error', () => {
      const error = SecurityAuthenticationError.invalidCredentials('basic');
      expect(error.reason).toBe('Invalid credentials');
      expect(error.authMethod).toBe('basic');
    });

    it('should create missing credentials error', () => {
      const error = SecurityAuthenticationError.missingCredentials('bearer');
      expect(error.reason).toBe('Missing credentials');
    });

    it('should create expired token error', () => {
      const error = SecurityAuthenticationError.expiredToken('jwt');
      expect(error.reason).toBe('Token expired');
    });

    it('should create malformed token error', () => {
      const error = SecurityAuthenticationError.malformedToken('jwt');
      expect(error.reason).toBe('Malformed token');
    });
  });

  describe('SecurityAuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new SecurityAuthorizationError(['admin'], ['user']);
      expect(error.code).toBe('SECURITY_AUTHORIZATION_ERROR');
      expect(error.name).toBe('SecurityAuthorizationError');
      expect(error.requiredPermissions).toEqual(['admin']);
      expect(error.userPermissions).toEqual(['user']);
    });

    it('should create insufficient permissions error', () => {
      const error = SecurityAuthorizationError.insufficientPermissions(['read', 'write'], ['read']);
      expect(error.requiredPermissions).toEqual(['read', 'write']);
      expect(error.userPermissions).toEqual(['read']);
    });

    it('should create access denied error', () => {
      const error = SecurityAuthorizationError.accessDenied('/admin');
      expect(error.requiredPermissions).toEqual(['/admin']);
      expect(error.userPermissions).toEqual([]);
      expect(error.context.resource).toBe('/admin');
    });
  });

  describe('SecurityThreatDetectedError', () => {
    it('should create threat detected error', () => {
      const error = new SecurityThreatDetectedError('SQL_INJECTION', 'HIGH', { query: 'SELECT * FROM users' });
      expect(error.code).toBe('SECURITY_THREAT_DETECTED');
      expect(error.name).toBe('SecurityThreatDetectedError');
      expect(error.threatType).toBe('SQL_INJECTION');
      expect(error.severity).toBe('HIGH');
    });
  });

  describe('SecurityRateLimitExceededError', () => {
    it('should create rate limit exceeded error', () => {
      const error = new SecurityRateLimitExceededError('192.168.1.1', 100, 60000, 30000);
      expect(error.code).toBe('SECURITY_RATE_LIMIT_EXCEEDED');
      expect(error.name).toBe('SecurityRateLimitExceededError');
      expect(error.identifier).toBe('192.168.1.1');
      expect(error.limit).toBe(100);
      expect(error.windowMs).toBe(60000);
      expect(error.retryAfterMs).toBe(30000);
    });
  });

  describe('SecurityCorsViolationError', () => {
    it('should create CORS violation error', () => {
      const error = new SecurityCorsViolationError('http://evil.com', ['http://trusted.com']);
      expect(error.code).toBe('SECURITY_CORS_VIOLATION');
      expect(error.name).toBe('SecurityCorsViolationError');
      expect(error.origin).toBe('http://evil.com');
      expect(error.allowedOrigins).toEqual(['http://trusted.com']);
    });
  });

  describe('SecuritySessionExpiredError', () => {
    it('should create session expired error', () => {
      const expiredAt = Date.now() - 1000;
      const error = new SecuritySessionExpiredError('session-123', expiredAt);
      expect(error.code).toBe('SECURITY_SESSION_EXPIRED');
      expect(error.name).toBe('SecuritySessionExpiredError');
      expect(error.sessionId).toBe('session-123');
      expect(error.expiredAt).toBe(expiredAt);
    });
  });

  describe('SecurityPolicyViolationError', () => {
    it('should create policy violation error', () => {
      const error = new SecurityPolicyViolationError('policy-1', 'rule-1', 'deny');
      expect(error.code).toBe('SECURITY_POLICY_VIOLATION');
      expect(error.name).toBe('SecurityPolicyViolationError');
      expect(error.policyId).toBe('policy-1');
      expect(error.rule).toBe('rule-1');
      expect(error.action).toBe('deny');
    });
  });

  describe('SecurityErrorFactory', () => {
    it('should create configuration error', () => {
      const error = SecurityErrorFactory.configuration('Test config error');
      expect(error).toBeInstanceOf(SecurityConfigurationError);
    });

    it('should create execution error', () => {
      const error = SecurityErrorFactory.execution('Test execution error');
      expect(error).toBeInstanceOf(SecurityExecutionError);
    });

    it('should create timeout error', () => {
      const error = SecurityErrorFactory.timeout('authenticate', 5000);
      expect(error).toBeInstanceOf(SecurityTimeoutError);
    });

    it('should create validation error', () => {
      const error = SecurityErrorFactory.validation('field', 'value', 'constraint');
      expect(error).toBeInstanceOf(SecurityValidationError);
    });

    it('should create authentication error', () => {
      const error = SecurityErrorFactory.authentication('jwt', 'Invalid token');
      expect(error).toBeInstanceOf(SecurityAuthenticationError);
    });

    it('should create authorization error', () => {
      const error = SecurityErrorFactory.authorization(['admin'], ['user']);
      expect(error).toBeInstanceOf(SecurityAuthorizationError);
    });

    it('should create threat detected error', () => {
      const error = SecurityErrorFactory.threatDetected('XSS', 'HIGH', { payload: '<script>' });
      expect(error).toBeInstanceOf(SecurityThreatDetectedError);
    });

    it('should create rate limit exceeded error', () => {
      const error = SecurityErrorFactory.rateLimitExceeded('ip', 100, 60000, 30000, Date.now() + 30000);
      expect(error).toBeInstanceOf(SecurityRateLimitExceededError);
    });

    it('should create CORS violation error', () => {
      const error = SecurityErrorFactory.corsViolation('http://evil.com', ['http://trusted.com']);
      expect(error).toBeInstanceOf(SecurityCorsViolationError);
    });

    it('should create session expired error', () => {
      const error = SecurityErrorFactory.sessionExpired('session-123', Date.now() - 1000);
      expect(error).toBeInstanceOf(SecuritySessionExpiredError);
    });

    it('should create policy violation error', () => {
      const error = SecurityErrorFactory.policyViolation('policy-1', 'rule-1', 'deny');
      expect(error).toBeInstanceOf(SecurityPolicyViolationError);
    });
  });
});