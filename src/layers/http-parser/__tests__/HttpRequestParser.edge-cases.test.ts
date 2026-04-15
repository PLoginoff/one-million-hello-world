/**
 * HTTP Request Parser Edge Cases Unit Tests
 * 
 * Edge case tests for HttpRequestParser implementation.
 * Tests error handling, timeout scenarios, and boundary conditions.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { HttpRequestParser } from '../implementations/HttpRequestParser';
import { ParserState } from '../types/http-parser-types';

describe('HttpRequestParser Edge Cases', () => {
  let parser: HttpRequestParser;

  beforeEach(() => {
    parser = new HttpRequestParser();
  });

  describe('Empty Input', () => {
    it('should handle empty buffer', () => {
      const raw = Buffer.from('', 'utf-8');
      const result = parser.parse(raw);

      expect(result.success).toBe(false);
    });

    it('should handle empty query string', () => {
      const result = parser.parseQueryString('');

      expect(result.parameters).toHaveLength(0);
    });

    it('should handle empty cookie header', () => {
      const result = parser.parseCookies('');

      expect(result.cookies.size).toBe(0);
    });

    it('should handle empty content type', () => {
      const result = parser.parseMimeType('');

      expect(result).toBeNull();
    });

    it('should handle empty content disposition', () => {
      const result = parser.parseContentDisposition('');

      expect(result).toBeNull();
    });
  });

  describe('Malformed Input', () => {
    it('should handle invalid request line', () => {
      const raw = Buffer.from('INVALID', 'utf-8');
      const result = parser.parse(raw);

      expect(result.success).toBe(false);
    });

    it('should handle invalid header format', () => {
      const headerLines = ['InvalidHeader'];
      const result = parser.parseHeaders(headerLines);

      expect(result.success).toBe(false);
    });

    it('should handle invalid status line', () => {
      const raw = Buffer.from('INVALID', 'utf-8');
      const result = parser.parseResponse(raw);

      expect(result.success).toBe(false);
    });
  });

  describe('Boundary Values', () => {
    it('should handle zero header count', () => {
      parser.setDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 0, maxUrlLength: 2048, allowHttp2: false, enableValidation: true, timeout: 30000, keepAlive: true, maxConnections: 100 });

      const config = parser.getDefaultConfig();

      expect(config.maxHeaderCount).toBe(0);
    });

    it('should handle zero URL length', () => {
      parser.setDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 100, maxUrlLength: 0, allowHttp2: false, enableValidation: true, timeout: 30000, keepAlive: true, maxConnections: 100 });

      const config = parser.getDefaultConfig();

      expect(config.maxUrlLength).toBe(0);
    });

    it('should handle zero timeout', () => {
      parser.setDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 100, maxUrlLength: 2048, allowHttp2: false, enableValidation: true, timeout: 0, keepAlive: true, maxConnections: 100 });

      const config = parser.getDefaultConfig();

      expect(config.timeout).toBe(0);
    });
  });

  describe('State Transitions', () => {
    it('should handle parse error state', () => {
      const raw = Buffer.from('INVALID', 'utf-8');
      parser.parse(raw);

      expect(parser.getState()).toBe(ParserState.ERROR);
    });

    it('should reset state after error', () => {
      const raw = Buffer.from('INVALID', 'utf-8');
      parser.parse(raw);
      parser.resetState();

      expect(parser.getState()).toBe(ParserState.IDLE);
    });
  });

  describe('Statistics Reset', () => {
    it('should handle multiple statistics resets', () => {
      parser.resetStats();
      parser.resetStats();
      parser.resetStats();

      const stats = parser.getStats();

      expect(stats.totalRequestsParsed).toBe(0);
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle empty configuration update', () => {
      parser.setDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 100, maxUrlLength: 2048, allowHttp2: false, enableValidation: true, timeout: 30000, keepAlive: true, maxConnections: 100 });

      const config = parser.getDefaultConfig();

      expect(config).toBeDefined();
    });
  });

  describe('Validation Rules Edge Cases', () => {
    it('should handle empty validation rules', () => {
      parser.setValidationRules({ requiredHeaders: [], forbiddenHeaders: [], maxHeaderNameLength: 128, maxHeaderValueLength: 8192, allowEmptyBody: true, validateContentType: false, validateContentLength: false, validateHost: false, validateUserAgent: false });

      const rules = parser.getValidationRules();

      expect(rules.requiredHeaders).toHaveLength(0);
      expect(rules.forbiddenHeaders).toHaveLength(0);
    });
  });

  describe('Chunked Encoding Edge Cases', () => {
    it('should handle empty chunked body', () => {
      const body = Buffer.from('', 'utf-8');
      const result = parser.parseChunkedEncoding(body);

      expect(result).toHaveLength(0);
    });

    it('should handle invalid chunk size', () => {
      const body = Buffer.from('invalid\r\n', 'utf-8');
      const result = parser.parseChunkedEncoding(body);

      expect(result).toHaveLength(0);
    });
  });

  describe('Multipart Form Data Edge Cases', () => {
    it('should handle empty multipart body', () => {
      const body = Buffer.from('', 'utf-8');
      const result = parser.parseMultipartFormData(body, 'boundary');

      expect(result.parts).toHaveLength(0);
    });

    it('should handle empty boundary', () => {
      const body = Buffer.from('--\r\n', 'utf-8');
      const result = parser.parseMultipartFormData(body, '');

      expect(result.parts).toHaveLength(0);
    });
  });

  describe('Query String Edge Cases', () => {
    it('should handle query string without value', () => {
      const result = parser.parseQueryString('name');

      expect(result.parameters).toHaveLength(1);
      expect(result.parameters[0].name).toBe('name');
      expect(result.parameters[0].value).toBe('');
    });

    it('should handle query string with special characters', () => {
      const result = parser.parseQueryString('name=hello%20world%21');

      expect(result.parameters[0].value).toBe('hello world!');
    });
  });

  describe('Cookie Edge Cases', () => {
    it('should handle cookie without value', () => {
      const result = parser.parseCookies('session=');

      expect(result.cookies.size).toBe(1);
      expect(result.cookies.get('session')?.value).toBe('');
    });

    it('should handle cookie with spaces', () => {
      const result = parser.parseCookies('  session = abc123  ');

      expect(result.cookies.size).toBe(1);
    });
  });

  describe('Response Validation Edge Cases', () => {
    it('should handle response without line', () => {
      const response = { line: undefined, headers: new Map(), body: Buffer.from('') };

      const isValid = parser.validateResponse(response);

      expect(isValid).toBe(false);
    });

    it('should handle response with invalid status code', () => {
      const response = { line: { version: 'HTTP/1.1' as const, statusCode: 999, reasonPhrase: 'Custom' }, headers: new Map(), body: Buffer.from('') };

      const isValid = parser.validateResponse(response);

      expect(isValid).toBe(false);
    });
  });

  describe('Health Status Edge Cases', () => {
    it('should handle health status after errors', () => {
      const raw = Buffer.from('INVALID', 'utf-8');
      parser.parse(raw);

      const health = parser.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThan(0);
    });
  });

  describe('Diagnostics Edge Cases', () => {
    it('should handle diagnostics after multiple parses', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      parser.parse(raw);
      parser.parse(raw);
      parser.parse(raw);

      const diagnostics = parser.runDiagnostics();

      expect(diagnostics.steps.length).toBe(3);
    });
  });

  describe('Warning Management Edge Cases', () => {
    it('should handle adding multiple warnings', () => {
      parser.addWarning({ code: 'WARN001', message: 'Warning 1', severity: 'low' });
      parser.addWarning({ code: 'WARN002', message: 'Warning 2', severity: 'medium' });
      parser.addWarning({ code: 'WARN003', message: 'Warning 3', severity: 'high' });

      const warnings = parser.getWarnings();

      expect(warnings).toHaveLength(3);
    });

    it('should handle clearing warnings when none exist', () => {
      parser.clearWarnings();

      const warnings = parser.getWarnings();

      expect(warnings).toHaveLength(0);
    });
  });

  describe('Method Validation Edge Cases', () => {
    it('should handle method validation with empty allowed list', () => {
      parser.setExtendedDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 100, maxUrlLength: 2048, allowHttp2: false, enableValidation: true, timeout: 30000, keepAlive: true, maxConnections: 100, enableCompression: false, enableDecompression: false, allowedContentTypes: [], allowedMethods: [], allowedOrigins: [], corsEnabled: false, rateLimitEnabled: false, rateLimitMax: 100, rateLimitWindow: 60000, securityHeadersEnabled: false, customHeaders: new Map() });

      const isAllowed = parser.isMethodAllowed('GET' as any);

      expect(isAllowed).toBe(true);
    });
  });

  describe('Content Type Validation Edge Cases', () => {
    it('should handle content type validation with empty allowed list', () => {
      parser.setExtendedDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 100, maxUrlLength: 2048, allowHttp2: false, enableValidation: true, timeout: 30000, keepAlive: true, maxConnections: 100, enableCompression: false, enableDecompression: false, allowedContentTypes: [], allowedMethods: [], allowedOrigins: [], corsEnabled: false, rateLimitEnabled: false, rateLimitMax: 100, rateLimitWindow: 60000, securityHeadersEnabled: false, customHeaders: new Map() });

      const isAllowed = parser.isContentTypeAllowed('application/json');

      expect(isAllowed).toBe(true);
    });
  });

  describe('Origin Validation Edge Cases', () => {
    it('should handle origin validation with empty allowed list', () => {
      parser.setExtendedDefaultConfig({ maxHeaderSize: 8192, maxBodySize: 10485760, strictMode: true, allowChunkedEncoding: true, maxHeaderCount: 100, maxUrlLength: 2048, allowHttp2: false, enableValidation: true, timeout: 30000, keepAlive: true, maxConnections: 100, enableCompression: false, enableDecompression: false, allowedContentTypes: [], allowedMethods: [], allowedOrigins: [], corsEnabled: false, rateLimitEnabled: false, rateLimitMax: 100, rateLimitWindow: 60000, securityHeadersEnabled: false, customHeaders: new Map() });

      const isAllowed = parser.isOriginAllowed('http://localhost');

      expect(isAllowed).toBe(true);
    });
  });
});
