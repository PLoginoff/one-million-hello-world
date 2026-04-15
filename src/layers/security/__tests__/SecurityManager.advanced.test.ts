/**
 * Security Manager Advanced Unit Tests
 * 
 * Advanced unit tests for SecurityManager implementation.
 * Tests extended security features including IP filtering, rate limiting, and diagnostics.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SecurityManager } from '../implementations/SecurityManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { AuthMethod, SecurityEvent, ThreatType } from '../types/security-types';

describe('SecurityManager Advanced', () => {
  let manager: SecurityManager;

  beforeEach(() => {
    manager = new SecurityManager();
  });

  describe('Extended Authentication', () => {
    it('should authenticate with extended result including metrics', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer valid-token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer valid-token\r\n\r\n', 'utf-8'),
      };

      const result = manager.authenticateExtended(request);

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.authDuration).toBeGreaterThan(0);
    });

    it('should track authentication statistics', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer valid-token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer valid-token\r\n\r\n', 'utf-8'),
      };

      manager.authenticateExtended(request);
      manager.authenticateExtended(request);

      const stats = manager.getStats();

      expect(stats.totalAuthAttempts).toBe(2);
      expect(stats.successfulAuthAttempts).toBe(2);
    });
  });

  describe('Extended Threat Detection', () => {
    it('should detect threats with extended result including patterns', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/?param=<script>alert(1)</script>', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /?param=<script>alert(1)</script> HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = manager.detectThreatsExtended(request);

      expect(result.isThreat).toBe(true);
      expect(result.detectedPatterns.length).toBeGreaterThan(0);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should provide recommendations for threats', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/?param=<script>alert(1)</script>', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /?param=<script>alert(1)</script> HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const result = manager.detectThreatsExtended(request);

      expect(result.recommendations).toContain('Review request for malicious content');
    });
  });

  describe('IP Address Validation', () => {
    it('should validate IP address when filtering is disabled', () => {
      const isValid = manager.validateIPAddress('192.168.1.1');

      expect(isValid).toBe(true);
    });

    it('should block IP address in blacklist', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableIPFiltering: true,
        ipFilterConfig: {
          whitelist: [],
          blacklist: ['192.168.1.1'],
          allowPrivateIPs: true,
          blockTorExitNodes: false,
          blockVPNs: false,
        },
      });

      const isValid = manager.validateIPAddress('192.168.1.1');

      expect(isValid).toBe(false);
    });

    it('should allow IP address in whitelist', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableIPFiltering: true,
        ipFilterConfig: {
          whitelist: ['192.168.1.1'],
          blacklist: [],
          allowPrivateIPs: true,
          blockTorExitNodes: false,
          blockVPNs: false,
        },
      });

      const isValid = manager.validateIPAddress('192.168.1.1');

      expect(isValid).toBe(true);
    });
  });

  describe('User Agent Validation', () => {
    it('should validate user agent when filtering is disabled', () => {
      const isValid = manager.validateUserAgent('Mozilla/5.0');

      expect(isValid).toBe(true);
    });

    it('should block malicious user agent', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableUserAgentFiltering: true,
        userAgentFilterConfig: {
          blockedPatterns: ['sqlmap'],
          allowedPatterns: [],
          requireUserAgent: false,
        },
      });

      const isValid = manager.validateUserAgent('sqlmap/1.0');

      expect(isValid).toBe(false);
    });
  });

  describe('Signature Validation', () => {
    it('should validate signature when disabled', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateSignature(request);

      expect(isValid).toBe(true);
    });
  });

  describe('Timestamp Validation', () => {
    it('should validate timestamp when disabled', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateTimestamp(request);

      expect(isValid).toBe(true);
    });
  });

  describe('Nonce Validation', () => {
    it('should validate nonce when disabled', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateNonce(request);

      expect(isValid).toBe(true);
    });

    it('should detect nonce reuse', () => {
      manager.addNonce('test-nonce', '127.0.0.1');

      const isUsed = manager.isNonceUsed('test-nonce');

      expect(isUsed).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should check rate limit when disabled', () => {
      const isAllowed = manager.checkRateLimit('127.0.0.1');

      expect(isAllowed).toBe(true);
    });

    it('should enforce rate limit when enabled', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableRateLimiting: true,
        rateLimitConfig: {
          maxRequests: 5,
          windowMs: 60000,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          enableBurstProtection: false,
          burstLimit: 10,
        },
      });

      for (let i = 0; i < 6; i++) {
        manager.checkRateLimit('127.0.0.1');
      }

      const isAllowed = manager.checkRateLimit('127.0.0.1');

      expect(isAllowed).toBe(false);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track security statistics', () => {
      const stats = manager.getStats();

      expect(stats.totalAuthAttempts).toBe(0);
      expect(stats.successfulAuthAttempts).toBe(0);
      expect(stats.failedAuthAttempts).toBe(0);
    });

    it('should reset statistics', () => {
      manager.resetStats();

      const stats = manager.getStats();

      expect(stats.totalAuthAttempts).toBe(0);
      expect(stats.totalThreatsDetected).toBe(0);
    });
  });

  describe('Health Status', () => {
    it('should return healthy status', () => {
      const health = manager.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThan(80);
      expect(health.checks.length).toBe(4);
    });
  });

  describe('Diagnostics', () => {
    it('should run security diagnostics', () => {
      const diagnostics = manager.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.steps.length).toBe(3);
      expect(diagnostics.summary.totalSteps).toBe(3);
    });
  });

  describe('Audit Logging', () => {
    it('should log security events', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['user-agent', 'Mozilla/5.0']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nUser-Agent: Mozilla/5.0\r\n\r\n', 'utf-8'),
      };

      manager.logSecurityEvent(SecurityEvent.AUTH_SUCCESS, request);

      const log = manager.getAuditLog();

      expect(log).toHaveLength(1);
      expect(log[0].event).toBe(SecurityEvent.AUTH_SUCCESS);
    });

    it('should limit audit log size', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['user-agent', 'Mozilla/5.0']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nUser-Agent: Mozilla/5.0\r\n\r\n', 'utf-8'),
      };

      for (let i = 0; i < 1100; i++) {
        manager.logSecurityEvent(SecurityEvent.AUTH_SUCCESS, request);
      }

      const log = manager.getAuditLog();

      expect(log.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Warning Management', () => {
    it('should add warning', () => {
      manager.addWarning({ code: 'WARN001', message: 'Test warning', severity: 'low' });

      const warnings = manager.getWarnings();

      expect(warnings).toHaveLength(1);
    });

    it('should clear warnings', () => {
      manager.addWarning({ code: 'WARN001', message: 'Test warning', severity: 'low' });
      manager.clearWarnings();

      const warnings = manager.getWarnings();

      expect(warnings).toHaveLength(0);
    });
  });

  describe('Extended Context Creation', () => {
    it('should create extended security context', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['user-agent', 'Mozilla/5.0']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nUser-Agent: Mozilla/5.0\r\n\r\n', 'utf-8'),
      };

      const context = manager.createExtendedContext(request, 'user-123', AuthMethod.BEARER_TOKEN);

      expect(context.authMethod).toBe(AuthMethod.BEARER_TOKEN);
      expect(context.tokenInfo).toBeDefined();
      expect(context.sessionInfo).toBeDefined();
      expect(context.ipInfo).toBeDefined();
    });
  });

  describe('Header Validation', () => {
    it('should validate required headers', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        requiredHeaders: ['authorization'],
      });

      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer token\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateRequiredHeaders(request);

      expect(isValid).toBe(true);
    });

    it('should validate content type', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        allowedContentTypes: ['application/json'],
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

    it('should validate header size', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer token\r\n\r\n', 'utf-8'),
      };

      const isValid = manager.validateHeaderSize(request);

      expect(isValid).toBe(true);
    });
  });

  describe('Threat Pattern Management', () => {
    it('should get threat patterns', () => {
      const patterns = manager.getThreatPatterns(ThreatType.XSS);

      expect(patterns).toContain('<script>');
    });

    it('should add custom threat pattern', () => {
      manager.addThreatPattern(ThreatType.XSS, 'custom-pattern');

      const patterns = manager.getThreatPatterns(ThreatType.XSS);

      expect(patterns).toContain('custom-pattern');
    });

    it('should remove threat pattern', () => {
      manager.removeThreatPattern(ThreatType.XSS, '<script>');

      const patterns = manager.getThreatPatterns(ThreatType.XSS);

      expect(patterns).not.toContain('<script>');
    });
  });

  describe('Nonce Cleanup', () => {
    it('should cleanup expired nonces', () => {
      manager.addNonce('test-nonce', '127.0.0.1');

      manager.cleanupExpiredNonces();

      const isUsed = manager.isNonceUsed('test-nonce');

      expect(isUsed).toBe(true);
    });
  });
});
