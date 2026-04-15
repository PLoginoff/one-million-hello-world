/**
 * Security Manager Edge Cases Unit Tests
 * 
 * Edge case unit tests for SecurityManager implementation.
 * Tests error handling, empty inputs, malformed inputs, and boundary values.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SecurityManager } from '../implementations/SecurityManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { SecurityErrorCode, ThreatType } from '../types/security-types';

describe('SecurityManager Edge Cases', () => {
  let manager: SecurityManager;

  beforeEach(() => {
    manager = new SecurityManager();
  });

  describe('Authentication Edge Cases', () => {
    it('should handle empty credentials', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        requireAuth: false,
      });

      const result = manager.authenticate(request);

      expect(result.success).toBe(true);
      expect(result.context?.isAuthenticated).toBe(false);
    });

    it('should handle malformed token', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer\r\n\r\n', 'utf-8'),
      };

      const result = manager.authenticate(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SecurityErrorCode.INVALID_CREDENTIALS);
    });

    it('should handle invalid token format', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'InvalidFormat token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: InvalidFormat token\r\n\r\n', 'utf-8'),
      };

      const result = manager.authenticate(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(SecurityErrorCode.INVALID_CREDENTIALS);
    });
  });

  describe('Authorization Edge Cases', () => {
    it('should handle empty permissions list', () => {
      const context = {
        isAuthenticated: true,
        userId: 'user-123',
        roles: ['user'],
        permissions: [],
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      const isAuthorized = manager.authorize(context, []);

      expect(isAuthorized).toBe(true);
    });

    it('should handle unauthenticated context', () => {
      const context = {
        isAuthenticated: false,
        roles: [],
        permissions: [],
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      const isAuthorized = manager.authorize(context, ['read']);

      expect(isAuthorized).toBe(false);
    });

    it('should handle missing required permissions', () => {
      const context = {
        isAuthenticated: true,
        userId: 'user-123',
        roles: ['user'],
        permissions: ['read'],
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      };

      const isAuthorized = manager.authorize(context, ['write']);

      expect(isAuthorized).toBe(false);
    });
  });

  describe('CORS Validation Edge Cases', () => {
    it('should handle missing origin header', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateCors(request);

      expect(isValid).toBe(true);
    });

    it('should handle wildcard origin', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['origin', 'https://example.com']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nOrigin: https://example.com\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateCors(request);

      expect(isValid).toBe(true);
    });

    it('should handle blocked origin', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        corsConfig: {
          ...manager.getSecurityPolicy().corsConfig,
          allowedOrigins: ['https://allowed.com'],
        },
      });

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['origin', 'https://blocked.com']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nOrigin: https://blocked.com\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateCors(request);

      expect(isValid).toBe(false);
    });
  });

  describe('Threat Detection Edge Cases', () => {
    it('should handle empty request body', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(false);
    });

    it('should handle disabled threat detection', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        threatDetectionEnabled: false,
      });

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/?param=<script>alert(1)</script>', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /?param=<script>alert(1)</script> HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(false);
    });

    it('should handle multiple threat patterns', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: "/?param=<script>alert(1)</script>&id=' OR '1'='1", version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from("GET /?param=<script>alert(1)</script>&id=' OR '1'='1 HTTP/1.1\r\n\r\n", 'utf-8'),
      };

      const result = manager.detectThreats(request);

      expect(result.isThreat).toBe(true);
    });
  });

  describe('Request Size Validation Edge Cases', () => {
    it('should handle exact size limit', () => {
      const maxSize = manager.getSecurityPolicy().maxRequestSize;
      const body = Buffer.alloc(maxSize);

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['content-length', maxSize.toString()]]),
        body,
        raw: body,
      };

      const isValid = manager.validateRequestSize(request);

      expect(isValid).toBe(true);
    });

    it('should handle size limit exceeded by one byte', () => {
      const maxSize = manager.getSecurityPolicy().maxRequestSize;
      const body = Buffer.alloc(maxSize + 1);

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['content-length', (maxSize + 1).toString()]]),
        body,
        raw: body,
      };

      const isValid = manager.validateRequestSize(request);

      expect(isValid).toBe(false);
    });
  });

  describe('IP Validation Edge Cases', () => {
    it('should handle empty IP address', () => {
      const isValid = manager.validateIPAddress('');

      expect(isValid).toBe(true);
    });

    it('should handle invalid IP format', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableIPFiltering: true,
      });

      const isValid = manager.validateIPAddress('invalid-ip');

      expect(isValid).toBe(true);
    });

    it('should handle IPv6 address', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableIPFiltering: true,
      });

      const isValid = manager.validateIPAddress('::1');

      expect(isValid).toBe(true);
    });
  });

  describe('User Agent Validation Edge Cases', () => {
    it('should handle empty user agent', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableUserAgentFiltering: true,
        userAgentFilterConfig: {
          ...manager.getSecurityPolicy().userAgentFilterConfig,
          requireUserAgent: false,
        },
      });

      const isValid = manager.validateUserAgent('');

      expect(isValid).toBe(true);
    });

    it('should handle very long user agent', () => {
      const longUA = 'Mozilla/5.0'.repeat(1000);

      const isValid = manager.validateUserAgent(longUA);

      expect(isValid).toBe(true);
    });
  });

  describe('Rate Limiting Edge Cases', () => {
    it('should handle burst limit exactly', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableRateLimiting: true,
        rateLimitConfig: {
          maxRequests: 100,
          windowMs: 60000,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          enableBurstProtection: true,
          burstLimit: 5,
        },
      });

      for (let i = 0; i < 5; i++) {
        manager.checkRateLimit('127.0.0.1');
      }

      const isAllowed = manager.checkRateLimit('127.0.0.1');

      expect(isAllowed).toBe(false);
    });

    it('should handle rate limit window reset', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableRateLimiting: true,
        rateLimitConfig: {
          maxRequests: 2,
          windowMs: 1,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          enableBurstProtection: false,
          burstLimit: 10,
        },
      });

      manager.checkRateLimit('127.0.0.1');
      manager.checkRateLimit('127.0.0.1');

      setTimeout(() => {
        const isAllowed = manager.checkRateLimit('127.0.0.1');
        expect(isAllowed).toBe(true);
      }, 10);
    });
  });

  describe('Statistics Edge Cases', () => {
    it('should handle zero auth attempts', () => {
      const stats = manager.getStats();

      expect(stats.totalAuthAttempts).toBe(0);
      expect(stats.averageAuthTime).toBe(0);
    });

    it('should handle stats reset during operation', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer valid-token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer valid-token\r\n\r\n', 'utf-8'),
      };

      manager.authenticateExtended(request);
      manager.resetStats();

      const stats = manager.getStats();

      expect(stats.totalAuthAttempts).toBe(0);
      expect(stats.successfulAuthAttempts).toBe(0);
    });
  });

  describe('Audit Log Edge Cases', () => {
    it('should handle empty audit log', () => {
      const log = manager.getAuditLog();

      expect(log).toHaveLength(0);
    });

    it('should handle log limit of zero', () => {
      const log = manager.getAuditLog(0);

      expect(log).toHaveLength(0);
    });

    it('should handle log limit larger than log size', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['user-agent', 'Mozilla/5.0']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nUser-Agent: Mozilla/5.0\r\n\r\n', 'utf-8'),
      };

      manager.logSecurityEvent('AUTH_SUCCESS' as any, request);

      const log = manager.getAuditLog(1000);

      expect(log).toHaveLength(1);
    });
  });

  describe('Warning Edge Cases', () => {
    it('should handle empty warnings list', () => {
      const warnings = manager.getWarnings();

      expect(warnings).toHaveLength(0);
    });

    it('should handle clearing empty warnings', () => {
      manager.clearWarnings();

      const warnings = manager.getWarnings();

      expect(warnings).toHaveLength(0);
    });
  });

  describe('Nonce Edge Cases', () => {
    it('should handle empty nonce', () => {
      const isUsed = manager.isNonceUsed('');

      expect(isUsed).toBe(false);
    });

    it('should handle nonce cleanup with empty list', () => {
      manager.cleanupExpiredNonces();

      expect(manager.isNonceUsed('test-nonce')).toBe(false);
    });
  });

  describe('Threat Pattern Edge Cases', () => {
    it('should handle removing non-existent pattern', () => {
      manager.removeThreatPattern(ThreatType.XSS, 'non-existent-pattern');

      const patterns = manager.getThreatPatterns(ThreatType.XSS);

      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should handle getting patterns for unknown threat type', () => {
      const patterns = manager.getThreatPatterns(ThreatType.CSRF);

      expect(patterns).toBeDefined();
    });
  });

  describe('Header Validation Edge Cases', () => {
    it('should handle empty required headers list', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        requiredHeaders: [],
      });

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateRequiredHeaders(request);

      expect(isValid).toBe(true);
    });

    it('should handle empty allowed content types', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        allowedContentTypes: [],
      });

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['content-type', 'application/json']]),
        body: Buffer.from('{}'),
        raw: Buffer.from('POST / HTTP/1.1\r\nContent-Type: application/json\r\n\r\n{}', 'utf-8'),
      };

      const isValid = manager.validateContentType(request);

      expect(isValid).toBe(true);
    });
  });

  describe('Health Status Edge Cases', () => {
    it('should handle degraded status', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        threatDetectionEnabled: false,
        corsEnabled: false,
      });

      const health = manager.getHealthStatus();

      expect(health.status).toBe('degraded');
    });
  });

  describe('Diagnostics Edge Cases', () => {
    it('should handle successful diagnostics', () => {
      const diagnostics = manager.runDiagnostics();

      expect(diagnostics.summary.overallStatus).toBe('success');
    });
  });
});
