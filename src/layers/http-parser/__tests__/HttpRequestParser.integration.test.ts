/**
 * HTTP Request Parser Integration Tests
 * 
 * Integration tests for HttpRequestParser implementation.
 * Tests end-to-end parsing workflows and feature integration.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { HttpRequestParser } from '../implementations/HttpRequestParser';
import { ParserState } from '../types/http-parser-types';

describe('HttpRequestParser Integration', () => {
  let parser: HttpRequestParser;

  beforeEach(() => {
    parser = new HttpRequestParser();
  });

  describe('Full Request Parsing Integration', () => {
    it('should parse complete HTTP request with query string and cookies', () => {
      const raw = Buffer.from(
        'GET /api/users?id=123&name=test HTTP/1.1\r\n' +
        'Host: localhost\r\n' +
        'Cookie: session=abc123; user=john\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"key": "value"}',
        'utf-8'
      );

      const result = parser.parseExtended(raw);

      expect(result.success).toBe(true);
      expect(result.data?.query?.parameters).toHaveLength(2);
      expect(result.data?.cookies?.cookies.size).toBe(2);
      expect(result.data?.mimeType?.type).toBe('application');
    });
  });

  describe('Configuration Chaining Integration', () => {
    it('should apply multiple configuration changes', () => {
      parser.setValidationRules({ requiredHeaders: [], forbiddenHeaders: [], maxHeaderNameLength: 128, maxHeaderValueLength: 8192, allowEmptyBody: true, validateContentType: false, validateContentLength: false, validateHost: false, validateUserAgent: false });
      parser.setSecurityHeadersConfig({ enableXFrameOptions: false, enableXContentTypeOptions: false, enableXSSProtection: false, enableStrictTransportSecurity: false, enableContentSecurityPolicy: false, enableReferrerPolicy: false, customSecurityHeaders: new Map() });
      parser.setCorsConfig({ enabled: false, allowedOrigins: [], allowedMethods: [], allowedHeaders: [], exposedHeaders: [], allowCredentials: false, maxAge: 86400 });
      parser.setRateLimitConfig({ enabled: false, maxRequests: 100, windowMs: 60000, skipSuccessfulRequests: false, skipFailedRequests: false });

      const rules = parser.getValidationRules();
      const security = parser.getSecurityHeadersConfig();
      const cors = parser.getCorsConfig();
      const rateLimit = parser.getRateLimitConfig();

      expect(rules).toBeDefined();
      expect(security).toBeDefined();
      expect(cors).toBeDefined();
      expect(rateLimit).toBeDefined();
    });
  });

  describe('Statistics Tracking Integration', () => {
    it('should track statistics across multiple parses', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      
      parser.parseExtended(raw);
      parser.parseExtended(raw);
      parser.parseExtended(raw);

      const stats = parser.getStats();

      expect(stats.totalRequestsParsed).toBe(3);
      expect(stats.totalBytesParsed).toBeGreaterThan(0);
    });
  });

  describe('State Management Integration', () => {
    it('should manage state through parse lifecycle', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      
      expect(parser.getState()).toBe(ParserState.IDLE);
      
      parser.parseExtended(raw);
      
      expect(parser.getState()).toBe(ParserState.COMPLETE);
      
      parser.resetState();
      
      expect(parser.getState()).toBe(ParserState.IDLE);
    });
  });

  describe('Extended Parse with Metrics Integration', () => {
    it('should provide metrics in extended parse result', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      
      const result = parser.parseExtended(raw);

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.metrics?.parseDuration).toBeGreaterThan(0);
    });
  });

  describe('Response Parsing Integration', () => {
    it('should parse HTTP response with extended features', () => {
      const raw = Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: text/html; charset=utf-8\r\n' +
        '\r\n' +
        '<html></html>',
        'utf-8'
      );

      const result = parser.parseResponseExtended(raw);

      expect(result.success).toBe(true);
      expect(result.data?.mimeType?.charset).toBe('utf-8');
      expect(result.data?.mimeType?.type).toBe('text');
    });
  });

  describe('Health and Diagnostics Integration', () => {
    it('should provide health status and diagnostics', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      
      parser.parseExtended(raw);

      const health = parser.getHealthStatus();
      const diagnostics = parser.runDiagnostics();

      expect(health.status).toBe('healthy');
      expect(diagnostics.steps.length).toBeGreaterThan(0);
      expect(diagnostics.summary.totalSteps).toBe(diagnostics.steps.length);
    });
  });

  describe('Warning System Integration', () => {
    it('should integrate warnings with parsing', () => {
      parser.addWarning({ code: 'WARN001', message: 'Test warning', severity: 'low' });
      
      const warnings = parser.getWarnings();

      expect(warnings).toHaveLength(1);
    });
  });

  describe('Method and Content Type Validation Integration', () => {
    it('should validate methods and content types with configuration', () => {
      parser.setExtendedDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 100, maxUrlLength: 2048, allowHttp2: false, enableValidation: true, timeout: 30000, keepAlive: true, maxConnections: 100, enableCompression: false, enableDecompression: false, allowedContentTypes: ['application/json' as any], allowedMethods: ['GET' as any], allowedOrigins: [], corsEnabled: false, rateLimitEnabled: false, rateLimitMax: 100, rateLimitWindow: 60000, securityHeadersEnabled: false, customHeaders: new Map() });

      const isMethodAllowed = parser.isMethodAllowed('GET' as any);
      const isContentTypeAllowed = parser.isContentTypeAllowed('application/json');

      expect(isMethodAllowed).toBe(true);
      expect(isContentTypeAllowed).toBe(true);
    });
  });
});
