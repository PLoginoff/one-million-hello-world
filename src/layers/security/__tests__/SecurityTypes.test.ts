/**
 * Security Types Unit Tests
 * 
 * Unit tests for Security Layer type definitions and enums.
 * Tests enum values and type interfaces.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import {
  SecurityErrorCode,
  ThreatType,
  SecurityEvent,
  AuthMethod,
} from '../types/security-types';

describe('Security Types', () => {
  describe('SecurityErrorCode', () => {
    it('should have all expected error codes', () => {
      expect(SecurityErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(SecurityErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(SecurityErrorCode.INVALID_TOKEN).toBe('INVALID_TOKEN');
      expect(SecurityErrorCode.EXPIRED_TOKEN).toBe('EXPIRED_TOKEN');
      expect(SecurityErrorCode.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(SecurityErrorCode.CORS_VIOLATION).toBe('CORS_VIOLATION');
      expect(SecurityErrorCode.THREAT_DETECTED).toBe('THREAT_DETECTED');
      expect(SecurityErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(SecurityErrorCode.IP_BLOCKED).toBe('IP_BLOCKED');
      expect(SecurityErrorCode.USER_AGENT_BLOCKED).toBe('USER_AGENT_BLOCKED');
      expect(SecurityErrorCode.REQUEST_SIZE_EXCEEDED).toBe('REQUEST_SIZE_EXCEEDED');
      expect(SecurityErrorCode.HEADER_SIZE_EXCEEDED).toBe('HEADER_SIZE_EXCEEDED');
      expect(SecurityErrorCode.INVALID_SIGNATURE).toBe('INVALID_SIGNATURE');
      expect(SecurityErrorCode.TIMESTAMP_TOO_OLD).toBe('TIMESTAMP_TOO_OLD');
      expect(SecurityErrorCode.TIMESTAMP_TOO_NEW).toBe('TIMESTAMP_TOO_NEW');
      expect(SecurityErrorCode.NONCE_REUSE).toBe('NONCE_REUSE');
      expect(SecurityErrorCode.MISSING_REQUIRED_HEADER).toBe('MISSING_REQUIRED_HEADER');
      expect(SecurityErrorCode.INVALID_CONTENT_TYPE).toBe('INVALID_CONTENT_TYPE');
    });

    it('should have 16 error codes', () => {
      const errorCodes = Object.values(SecurityErrorCode);
      expect(errorCodes).toHaveLength(16);
    });
  });

  describe('ThreatType', () => {
    it('should have all expected threat types', () => {
      expect(ThreatType.SQL_INJECTION).toBe('SQL_INJECTION');
      expect(ThreatType.XSS).toBe('XSS');
      expect(ThreatType.CSRF).toBe('CSRF');
      expect(ThreatType.PATH_TRAVERSAL).toBe('PATH_TRAVERSAL');
      expect(ThreatType.DDOS).toBe('DDOS');
      expect(ThreatType.MALICIOUS_USER_AGENT).toBe('MALICIOUS_USER_AGENT');
      expect(ThreatType.COMMAND_INJECTION).toBe('COMMAND_INJECTION');
      expect(ThreatType.LDAP_INJECTION).toBe('LDAP_INJECTION');
      expect(ThreatType.XML_INJECTION).toBe('XML_INJECTION');
      expect(ThreatType.SSRF).toBe('SSRF');
      expect(ThreatType.XXE).toBe('XXE');
      expect(ThreatType.HEADER_INJECTION).toBe('HEADER_INJECTION');
      expect(ThreatType.PROTOCOL_VIOLATION).toBe('PROTOCOL_VIOLATION');
    });

    it('should have 13 threat types', () => {
      const threatTypes = Object.values(ThreatType);
      expect(threatTypes).toHaveLength(13);
    });
  });

  describe('SecurityEvent', () => {
    it('should have all expected security events', () => {
      expect(SecurityEvent.AUTH_SUCCESS).toBe('AUTH_SUCCESS');
      expect(SecurityEvent.AUTH_FAILURE).toBe('AUTH_FAILURE');
      expect(SecurityEvent.AUTHORIZATION_FAILURE).toBe('AUTHORIZATION_FAILURE');
      expect(SecurityEvent.CORS_VIOLATION).toBe('CORS_VIOLATION');
      expect(SecurityEvent.THREAT_DETECTED).toBe('THREAT_DETECTED');
      expect(SecurityEvent.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(SecurityEvent.IP_BLOCKED).toBe('IP_BLOCKED');
      expect(SecurityEvent.SIGNATURE_VALIDATION_FAILURE).toBe('SIGNATURE_VALIDATION_FAILURE');
      expect(SecurityEvent.TIMESTAMP_VALIDATION_FAILURE).toBe('TIMESTAMP_VALIDATION_FAILURE');
      expect(SecurityEvent.NONCE_REUSE).toBe('NONCE_REUSE');
    });

    it('should have 10 security events', () => {
      const securityEvents = Object.values(SecurityEvent);
      expect(securityEvents).toHaveLength(10);
    });
  });

  describe('AuthMethod', () => {
    it('should have all expected authentication methods', () => {
      expect(AuthMethod.BEARER_TOKEN).toBe('BEARER_TOKEN');
      expect(AuthMethod.API_KEY).toBe('API_KEY');
      expect(AuthMethod.BASIC_AUTH).toBe('BASIC_AUTH');
      expect(AuthMethod.JWT).toBe('JWT');
      expect(AuthMethod.OAUTH2).toBe('OAUTH2');
      expect(AuthMethod.SESSION_COOKIE).toBe('SESSION_COOKIE');
      expect(AuthMethod.SIGNATURE).toBe('SIGNATURE');
      expect(AuthMethod.ANONYMOUS).toBe('ANONYMOUS');
    });

    it('should have 8 authentication methods', () => {
      const authMethods = Object.values(AuthMethod);
      expect(authMethods).toHaveLength(8);
    });
  });

  describe('Enum Values Consistency', () => {
    it('should have unique error code values', () => {
      const errorCodes = Object.values(SecurityErrorCode);
      const uniqueCodes = new Set(errorCodes);
      expect(uniqueCodes.size).toBe(errorCodes.length);
    });

    it('should have unique threat type values', () => {
      const threatTypes = Object.values(ThreatType);
      const uniqueTypes = new Set(threatTypes);
      expect(uniqueTypes.size).toBe(threatTypes.length);
    });

    it('should have unique security event values', () => {
      const securityEvents = Object.values(SecurityEvent);
      const uniqueEvents = new Set(securityEvents);
      expect(uniqueEvents.size).toBe(securityEvents.length);
    });

    it('should have unique auth method values', () => {
      const authMethods = Object.values(AuthMethod);
      const uniqueMethods = new Set(authMethods);
      expect(uniqueMethods.size).toBe(authMethods.length);
    });
  });
});
