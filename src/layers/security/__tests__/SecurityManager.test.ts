/**
 * Security Manager Unit Tests
 * 
 * Tests for SecurityManager implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SecurityManager } from '../implementations/SecurityManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { HttpMethod, HttpVersion } from '../../http-parser/types/http-parser-types';
import { SecurityErrorCode, ThreatType } from '../types/security-types';

describe('SecurityManager', () => {
  let manager: SecurityManager;

  beforeEach(() => {
    manager = new SecurityManager();
  });

  describe('getSecurityPolicy', () => {
    it('should return default security policy', () => {
      const policy = manager.getSecurityPolicy();

      expect(policy).toBeDefined();
      expect(policy.requireAuth).toBe(false);
      expect(policy.corsEnabled).toBe(true);
      expect(policy.threatDetectionEnabled).toBe(true);
    });
  });

  describe('setSecurityPolicy', () => {
    it('should update security policy', () => {
      const newPolicy = {
        requireAuth: true,
        allowedRoles: ['admin'],
        corsEnabled: false,
        corsConfig: {
          allowedOrigins: ['https://example.com'],
          allowedMethods: ['GET'],
          allowedHeaders: ['Content-Type'],
          exposedHeaders: [],
          credentials: false,
          maxAge: 3600,
        },
        threatDetectionEnabled: false,
        maxRequestSize: 5000000,
      };

      manager.setSecurityPolicy(newPolicy);
      const policy = manager.getSecurityPolicy();

      expect(policy.requireAuth).toBe(true);
      expect(policy.corsEnabled).toBe(false);
      expect(policy.threatDetectionEnabled).toBe(false);
    });
  });

  describe('authenticate', () => {
    it('should succeed with valid Bearer token', () => {
      const request = createMockRequest();
      request.headers.set('authorization', 'Bearer valid-token');

      const result = manager.authenticate(request);

      expect(result.success).toBe(true);
      expect(result.context?.isAuthenticated).toBe(true);
      expect(result.context?.userId).toBe('user-123');
    });

    it('should fail with invalid token', () => {
      const request = createMockRequest();
      request.headers.set('authorization', 'Bearer invalid-token');

      const result = manager.authenticate(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SecurityErrorCode.INVALID_TOKEN);
    });

    it('should succeed with valid API key', () => {
      const request = createMockRequest();
      request.headers.set('x-api-key', 'valid-api-key');

      const result = manager.authenticate(request);

      expect(result.success).toBe(true);
      expect(result.context?.isAuthenticated).toBe(true);
      expect(result.context?.userId).toBe('api-user-456');
    });

    it('should fail with invalid API key', () => {
      const request = createMockRequest();
      request.headers.set('x-api-key', 'invalid-api-key');

      const result = manager.authenticate(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SecurityErrorCode.INVALID_CREDENTIALS);
    });

    it('should create anonymous context when auth not required', () => {
      const request = createMockRequest();
      const result = manager.authenticate(request);

      expect(result.success).toBe(true);
      expect(result.context?.isAuthenticated).toBe(false);
    });

    it('should fail when auth required but no credentials', () => {
      const request = createMockRequest();
      manager.setSecurityPolicy({ requireAuth: true, allowedRoles: [], corsEnabled: true, corsConfig: manager.getSecurityPolicy().corsConfig, threatDetectionEnabled: true, maxRequestSize: 10485760 });

      const result = manager.authenticate(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SecurityErrorCode.UNAUTHORIZED);
    });
  });

  describe('authorize', () => {
    it('should authorize with matching permissions', () => {
      const context = {
        isAuthenticated: true,
        userId: 'user-123',
        roles: ['user'],
        permissions: ['read', 'write'],
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      };

      const result = manager.authorize(context, ['read']);

      expect(result).toBe(true);
    });

    it('should fail with missing permissions', () => {
      const context = {
        isAuthenticated: true,
        userId: 'user-123',
        roles: ['user'],
        permissions: ['read'],
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      };

      const result = manager.authorize(context, ['write']);

      expect(result).toBe(false);
    });

    it('should fail when not authenticated', () => {
      const context = {
        isAuthenticated: false,
        roles: [],
        permissions: [],
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      };

      const result = manager.authorize(context, ['read']);

      expect(result).toBe(false);
    });

    it('should authorize when no permissions required', () => {
      const context = {
        isAuthenticated: true,
        userId: 'user-123',
        roles: ['user'],
        permissions: [],
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      };

      const result = manager.authorize(context, []);

      expect(result).toBe(true);
    });
  });

  describe('validateCors', () => {
    it('should validate with wildcard origin', () => {
      const request = createMockRequest();
      request.headers.set('origin', 'https://example.com');

      const result = manager.validateCors(request);

      expect(result).toBe(true);
    });

    it('should validate with specific allowed origin', () => {
      const request = createMockRequest();
      request.headers.set('origin', 'https://example.com');
      manager.setSecurityPolicy({
        requireAuth: false,
        allowedRoles: [],
        corsEnabled: true,
        corsConfig: {
          allowedOrigins: ['https://example.com'],
          allowedMethods: ['GET'],
          allowedHeaders: ['Content-Type'],
          exposedHeaders: [],
          credentials: false,
          maxAge: 86400,
        },
        threatDetectionEnabled: true,
        maxRequestSize: 10485760,
      });

      const result = manager.validateCors(request);

      expect(result).toBe(true);
    });

    it('should fail with disallowed origin', () => {
      const request = createMockRequest();
      request.headers.set('origin', 'https://malicious.com');
      manager.setSecurityPolicy({
        requireAuth: false,
        allowedRoles: [],
        corsEnabled: true,
        corsConfig: {
          allowedOrigins: ['https://example.com'],
          allowedMethods: ['GET'],
          allowedHeaders: ['Content-Type'],
          exposedHeaders: [],
          credentials: false,
          maxAge: 86400,
        },
        threatDetectionEnabled: true,
        maxRequestSize: 10485760,
      });

      const result = manager.validateCors(request);

      expect(result).toBe(false);
    });

    it('should pass when CORS disabled', () => {
      const request = createMockRequest();
      manager.setSecurityPolicy({
        requireAuth: false,
        allowedRoles: [],
        corsEnabled: false,
        corsConfig: manager.getSecurityPolicy().corsConfig,
        threatDetectionEnabled: true,
        maxRequestSize: 10485760,
      });

      const result = manager.validateCors(request);

      expect(result).toBe(true);
    });
  });

  describe('detectThreats', () => {
    it('should detect XSS threat', () => {
      const request = createMockRequest();
      request.line.path = '/search?q=<script>alert(1)</script>';

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(true);
      expect(result.threatType).toBe(ThreatType.XSS);
    });

    it('should detect SQL injection threat', () => {
      const request = createMockRequest();
      request.line.path = "/users?id=1' OR '1'='1";

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(true);
      expect(result.threatType).toBe(ThreatType.SQL_INJECTION);
    });

    it('should detect path traversal threat', () => {
      const request = createMockRequest();
      request.line.path = '/files/../../../etc/passwd';

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(true);
      expect(result.threatType).toBe(ThreatType.PATH_TRAVERSAL);
    });

    it('should detect malicious user agent', () => {
      const request = createMockRequest();
      request.headers.set('user-agent', 'sqlmap/1.0');

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(true);
      expect(result.threatType).toBe(ThreatType.MALICIOUS_USER_AGENT);
    });

    it('should not detect threats in safe request', () => {
      const request = createMockRequest();

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(false);
    });

    it('should skip detection when disabled', () => {
      const request = createMockRequest();
      request.line.path = '/search?q=<script>alert(1)</script>';
      manager.setSecurityPolicy({
        requireAuth: false,
        allowedRoles: [],
        corsEnabled: true,
        corsConfig: manager.getSecurityPolicy().corsConfig,
        threatDetectionEnabled: false,
        maxRequestSize: 10485760,
      });

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(false);
    });
  });

  describe('validateRequestSize', () => {
    it('should validate request within size limit', () => {
      const request = createMockRequest();

      const result = manager.validateRequestSize(request);

      expect(result).toBe(true);
    });

    it('should fail when request exceeds size limit', () => {
      const largeBody = Buffer.alloc(20000000);
      const request = createMockRequest();
      request.raw = largeBody;
      manager.setSecurityPolicy({
        requireAuth: false,
        allowedRoles: [],
        corsEnabled: true,
        corsConfig: manager.getSecurityPolicy().corsConfig,
        threatDetectionEnabled: true,
        maxRequestSize: 1000,
      });

      const result = manager.validateRequestSize(request);

      expect(result).toBe(false);
    });
  });

  describe('extractSecurityContext', () => {
    it('should extract context from authenticated request', () => {
      const request = createMockRequest();
      request.headers.set('authorization', 'Bearer valid-token');

      const context = manager.extractSecurityContext(request);

      expect(context).not.toBeNull();
      expect(context?.isAuthenticated).toBe(true);
    });

    it('should return null for unauthenticated request', () => {
      const request = createMockRequest();

      const context = manager.extractSecurityContext(request);

      expect(context).not.toBeNull();
      expect(context?.isAuthenticated).toBe(false);
    });
  });
});

function createMockRequest(): HttpRequest {
  return {
    line: {
      method: HttpMethod.GET,
      path: '/',
      version: HttpVersion.HTTP_1_1,
    },
    headers: new Map([
      ['host', 'localhost'],
      ['user-agent', 'test-agent'],
    ]),
    body: Buffer.from(''),
    raw: Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'),
  };
}
