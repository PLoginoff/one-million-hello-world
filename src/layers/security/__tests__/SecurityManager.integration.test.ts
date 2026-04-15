/**
 * Security Manager Integration Tests
 * 
 * Integration tests for SecurityManager implementation.
 * Tests end-to-end security workflows and feature integration.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { SecurityManager } from '../implementations/SecurityManager';
import { HttpRequest } from '../../http-parser/types/http-parser-types';
import { SecurityEvent, AuthMethod } from '../types/security-types';

describe('SecurityManager Integration', () => {
  let manager: SecurityManager;

  beforeEach(() => {
    manager = new SecurityManager();
  });

  describe('Full Security Workflow Integration', () => {
    it('should authenticate and authorize request', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer valid-token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer valid-token\r\n\r\n', 'utf-8'),
      };

      const authResult = manager.authenticate(request);

      expect(authResult.success).toBe(true);

      if (authResult.context) {
        const isAuthorized = manager.authorize(authResult.context, ['read']);

        expect(isAuthorized).toBe(true);
      }
    });
  });

  describe('Configuration Chaining Integration', () => {
    it('should apply multiple security configurations', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableRateLimiting: true,
        enableIPFiltering: true,
        enableUserAgentFiltering: true,
        enableThreatDetection: true,
      });

      const policy = manager.getSecurityPolicy();

      expect(policy.enableRateLimiting).toBe(true);
      expect(policy.enableIPFiltering).toBe(true);
      expect(policy.enableUserAgentFiltering).toBe(true);
      expect(policy.threatDetectionEnabled).toBe(true);
    });
  });

  describe('Statistics Tracking Integration', () => {
    it('should track statistics across multiple operations', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer valid-token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer valid-token\r\n\r\n', 'utf-8'),
      };

      manager.authenticateExtended(request);
      manager.detectThreats(request);

      const stats = manager.getStats();

      expect(stats.totalAuthAttempts).toBe(1);
      expect(stats.successfulAuthAttempts).toBe(1);
    });
  });

  describe('Audit Log Integration', () => {
    it('should log security events and retrieve them', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['user-agent', 'Mozilla/5.0']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nUser-Agent: Mozilla/5.0\r\n\r\n', 'utf-8'),
      };

      manager.logSecurityEvent(SecurityEvent.AUTH_SUCCESS, request);
      manager.logSecurityEvent(SecurityEvent.AUTH_FAILURE, request);

      const log = manager.getAuditLog(10);

      expect(log).toHaveLength(2);
      expect(log[0].event).toBe(SecurityEvent.AUTH_SUCCESS);
      expect(log[1].event).toBe(SecurityEvent.AUTH_FAILURE);
    });
  });

  describe('Health Status Integration', () => {
    it('should provide comprehensive health status', () => {
      const health = manager.getHealthStatus();

      expect(health.status).toBeDefined();
      expect(health.score).toBeGreaterThan(0);
      expect(health.checks).toHaveLength(4);
      expect(health.lastCheck).toBeInstanceOf(Date);
    });
  });

  describe('Diagnostics Integration', () => {
    it('should run complete diagnostics', () => {
      const diagnostics = manager.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.duration).toBeGreaterThan(0);
      expect(diagnostics.steps).toHaveLength(3);
      expect(diagnostics.summary.totalSteps).toBe(3);
    });
  });

  describe('Extended Context Integration', () => {
    it('should create extended context with all components', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['user-agent', 'Mozilla/5.0']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nUser-Agent: Mozilla/5.0\r\n\r\n', 'utf-8'),
      };

      const context = manager.createExtendedContext(request, 'user-123', AuthMethod.BEARER_TOKEN);

      expect(context.isAuthenticated).toBe(true);
      expect(context.authMethod).toBe(AuthMethod.BEARER_TOKEN);
      expect(context.tokenInfo).toBeDefined();
      expect(context.sessionInfo).toBeDefined();
      expect(context.ipInfo).toBeDefined();
      expect(context.metadata).toBeInstanceOf(Map);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should enforce rate limit across multiple requests', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        enableRateLimiting: true,
        rateLimitConfig: {
          maxRequests: 3,
          windowMs: 60000,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          enableBurstProtection: false,
          burstLimit: 10,
        },
      });

      for (let i = 0; i < 3; i++) {
        expect(manager.checkRateLimit('127.0.0.1')).toBe(true);
      }

      expect(manager.checkRateLimit('127.0.0.1')).toBe(false);
    });
  });

  describe('Threat Detection Integration', () => {
    it('should detect threats and update statistics', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/?param=<script>alert(1)</script>', version: 'HTTP/1.1' as const },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from('GET /?param=<script>alert(1)</script> HTTP/1.1\r\n\r\n', 'utf-8'),
      };

      manager.detectThreats(request);

      const stats = manager.getStats();

      expect(stats.totalThreatsDetected).toBe(1);
    });
  });

  describe('IP Filtering Integration', () => {
    it('should block IP and update statistics', () => {
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

      manager.validateIPAddress('192.168.1.1');

      const stats = manager.getStats();

      expect(stats.totalIPBlocks).toBe(1);
    });
  });

  describe('Warning System Integration', () => {
    it('should add warnings and retrieve them', () => {
      manager.addWarning({ code: 'WARN001', message: 'Test warning', severity: 'low' });
      manager.addWarning({ code: 'WARN002', message: 'Another warning', severity: 'medium' });

      const warnings = manager.getWarnings();

      expect(warnings).toHaveLength(2);
      expect(warnings[0].code).toBe('WARN001');
      expect(warnings[1].code).toBe('WARN002');
    });
  });

  describe('Nonce Management Integration', () => {
    it('should add nonce and detect reuse', () => {
      manager.addNonce('test-nonce', '127.0.0.1');

      const isUsed = manager.isNonceUsed('test-nonce');

      expect(isUsed).toBe(true);
    });
  });

  describe('Header Validation Integration', () => {
    it('should validate all header requirements', () => {
      manager.setSecurityPolicy({
        ...manager.getSecurityPolicy(),
        requiredHeaders: ['authorization', 'content-type'],
        allowedContentTypes: ['application/json'],
      });

      const request: HttpRequest = {
        line: { method: 'POST' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([
          ['authorization', 'Bearer token'],
          ['content-type', 'application/json'],
        ]),
        body: Buffer.from('{}'),
        raw: Buffer.from('POST / HTTP/1.1\r\nAuthorization: Bearer token\r\nContent-Type: application/json\r\n\r\n{}', 'utf-8'),
      };

      const hasRequired = manager.validateRequiredHeaders(request);
      const hasValidContentType = manager.validateContentType(request);
      const hasValidSize = manager.validateHeaderSize(request);

      expect(hasRequired).toBe(true);
      expect(hasValidContentType).toBe(true);
      expect(hasValidSize).toBe(true);
    });
  });

  describe('Extended Auth Integration', () => {
    it('should authenticate with metrics and warnings', () => {
      const request: HttpRequest = {
        line: { method: 'GET' as const, path: '/', version: 'HTTP/1.1' as const },
        headers: new Map([['authorization', 'Bearer valid-token']]),
        body: Buffer.from(''),
        raw: Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer valid-token\r\n\r\n', 'utf-8'),
      };

      manager.addWarning({ code: 'WARN001', message: 'Test warning', severity: 'low' });

      const result = manager.authenticateExtended(request);

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.authDuration).toBeGreaterThan(0);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBe(1);
    });
  });

  describe('Extended Threat Detection Integration', () => {
    it('should detect threats with patterns and recommendations', () => {
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
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
