/**
 * HTTP Request Parser Advanced Unit Tests
 * 
 * Advanced unit tests for HttpRequestParser implementation.
 * Tests extended parsing features including query strings, cookies, MIME types, etc.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { HttpRequestParser } from '../implementations/HttpRequestParser';
import { HttpMethod, HttpVersion, ParserState } from '../types/http-parser-types';

describe('HttpRequestParser Advanced', () => {
  let parser: HttpRequestParser;

  beforeEach(() => {
    parser = new HttpRequestParser();
  });

  describe('Query String Parsing', () => {
    it('should parse simple query string', () => {
      const result = parser.parseQueryString('name=value');

      expect(result.parameters).toHaveLength(1);
      expect(result.parameters[0].name).toBe('name');
      expect(result.parameters[0].value).toBe('value');
    });

    it('should parse multiple parameters', () => {
      const result = parser.parseQueryString('name=value&age=25');

      expect(result.parameters).toHaveLength(2);
      expect(result.parameters[0].name).toBe('name');
      expect(result.parameters[1].name).toBe('age');
    });

    it('should handle empty query string', () => {
      const result = parser.parseQueryString('');

      expect(result.parameters).toHaveLength(0);
      expect(result.raw).toBe('');
    });

    it('should decode URL encoded values', () => {
      const result = parser.parseQueryString('name=John%20Doe');

      expect(result.parameters[0].value).toBe('John Doe');
    });
  });

  describe('Cookie Parsing', () => {
    it('should parse single cookie', () => {
      const result = parser.parseCookies('session=abc123');

      expect(result.cookies.size).toBe(1);
      expect(result.cookies.get('session')?.value).toBe('abc123');
    });

    it('should parse multiple cookies', () => {
      const result = parser.parseCookies('session=abc123; user=john');

      expect(result.cookies.size).toBe(2);
      expect(result.cookies.get('session')?.value).toBe('abc123');
      expect(result.cookies.get('user')?.value).toBe('john');
    });

    it('should handle empty cookie header', () => {
      const result = parser.parseCookies('');

      expect(result.cookies.size).toBe(0);
      expect(result.raw).toBe('');
    });
  });

  describe('MIME Type Parsing', () => {
    it('should parse simple MIME type', () => {
      const result = parser.parseMimeType('text/html');

      expect(result?.type).toBe('text');
      expect(result?.subtype).toBe('html');
    });

    it('should parse MIME type with charset', () => {
      const result = parser.parseMimeType('text/html; charset=utf-8');

      expect(result?.type).toBe('text');
      expect(result?.subtype).toBe('html');
      expect(result?.charset).toBe('utf-8');
    });

    it('should parse MIME type with boundary', () => {
      const result = parser.parseMimeType('multipart/form-data; boundary=----WebKitFormBoundary');

      expect(result?.type).toBe('multipart');
      expect(result?.subtype).toBe('form-data');
      expect(result?.boundary).toBe('----WebKitFormBoundary');
    });

    it('should return null for empty content type', () => {
      const result = parser.parseMimeType('');

      expect(result).toBeNull();
    });
  });

  describe('Content Disposition Parsing', () => {
    it('should parse inline disposition', () => {
      const result = parser.parseContentDisposition('inline');

      expect(result?.type).toBe('inline');
    });

    it('should parse attachment with filename', () => {
      const result = parser.parseContentDisposition('attachment; filename="file.txt"');

      expect(result?.type).toBe('attachment');
      expect(result?.filename).toBe('file.txt');
    });

    it('should parse form-data with name', () => {
      const result = parser.parseContentDisposition('form-data; name="field"');

      expect(result?.type).toBe('form-data');
      expect(result?.name).toBe('field');
    });

    it('should return null for empty disposition', () => {
      const result = parser.parseContentDisposition('');

      expect(result).toBeNull();
    });
  });

  describe('Chunked Encoding Parsing', () => {
    it('should parse chunked encoding', () => {
      const body = Buffer.from('5\r\nhello\r\n0\r\n\r\n', 'utf-8');
      const result = parser.parseChunkedEncoding(body);

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(5);
      expect(result[0].data.toString()).toBe('hello');
    });

    it('should handle empty chunked body', () => {
      const body = Buffer.from('0\r\n\r\n', 'utf-8');
      const result = parser.parseChunkedEncoding(body);

      expect(result).toHaveLength(0);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track parsing statistics', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      parser.parseExtended(raw);

      const stats = parser.getStats();

      expect(stats.totalRequestsParsed).toBe(1);
      expect(stats.totalBytesParsed).toBeGreaterThan(0);
    });

    it('should reset statistics', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      parser.parseExtended(raw);
      parser.resetStats();

      const stats = parser.getStats();

      expect(stats.totalRequestsParsed).toBe(0);
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('Parser State Management', () => {
    it('should track parser state', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      parser.parseExtended(raw);

      expect(parser.getState()).toBe(ParserState.COMPLETE);
    });

    it('should reset parser state', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n', 'utf-8');
      parser.parseExtended(raw);
      parser.resetState();

      expect(parser.getState()).toBe(ParserState.IDLE);
    });
  });

  describe('Extended Configuration', () => {
    it('should set and get extended configuration', () => {
      const config = parser.getExtendedDefaultConfig();

      expect(config).toBeDefined();
      expect(config.enableCompression).toBe(false);
    });

    it('should update extended configuration', () => {
      parser.setExtendedDefaultConfig({ enableCompression: true });

      const config = parser.getExtendedDefaultConfig();

      expect(config.enableCompression).toBe(true);
    });
  });

  describe('Validation Rules', () => {
    it('should set validation rules', () => {
      parser.setValidationRules({ requiredHeaders: ['host'] });

      const rules = parser.getValidationRules();

      expect(rules.requiredHeaders).toContain('host');
    });
  });

  describe('Response Parsing', () => {
    it('should parse HTTP response', () => {
      const raw = Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n', 'utf-8');
      const result = parser.parseResponse(raw);

      expect(result.success).toBe(true);
      expect(result.data?.line.statusCode).toBe(200);
    });

    it('should validate HTTP response', () => {
      const raw = Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n', 'utf-8');
      const result = parser.parseResponse(raw);

      if (result.success && result.data) {
        const isValid = parser.validateResponse(result.data);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('Health Status', () => {
    it('should return healthy status', () => {
      const health = parser.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThan(80);
    });
  });

  describe('Diagnostics', () => {
    it('should run diagnostics', async () => {
      const diagnostics = parser.runDiagnostics();

      expect(diagnostics.traceId).toBeDefined();
      expect(diagnostics.steps.length).toBe(3);
      expect(diagnostics.summary.totalSteps).toBe(3);
    });
  });

  describe('Security Headers Configuration', () => {
    it('should set security headers config', () => {
      parser.setSecurityHeadersConfig({ enableXFrameOptions: true });

      const config = parser.getSecurityHeadersConfig();

      expect(config.enableXFrameOptions).toBe(true);
    });
  });

  describe('CORS Configuration', () => {
    it('should set CORS config', () => {
      parser.setCorsConfig({ enabled: true });

      const config = parser.getCorsConfig();

      expect(config.enabled).toBe(true);
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should set rate limit config', () => {
      parser.setRateLimitConfig({ enabled: true });

      const config = parser.getRateLimitConfig();

      expect(config.enabled).toBe(true);
    });
  });

  describe('Method Validation', () => {
    it('should allow all methods by default', () => {
      expect(parser.isMethodAllowed(HttpMethod.GET)).toBe(true);
      expect(parser.isMethodAllowed(HttpMethod.POST)).toBe(true);
    });
  });

  describe('Content Type Validation', () => {
    it('should allow all content types by default', () => {
      expect(parser.isContentTypeAllowed('application/json')).toBe(true);
      expect(parser.isContentTypeAllowed('text/html')).toBe(true);
    });
  });

  describe('Origin Validation', () => {
    it('should allow all origins by default', () => {
      expect(parser.isOriginAllowed('http://localhost')).toBe(true);
      expect(parser.isOriginAllowed('https://example.com')).toBe(true);
    });
  });

  describe('Warning Management', () => {
    it('should add warning', () => {
      parser.addWarning({ code: 'WARN001', message: 'Test warning', severity: 'low' });

      const warnings = parser.getWarnings();

      expect(warnings).toHaveLength(1);
      expect(warnings[0].code).toBe('WARN001');
    });

    it('should clear warnings', () => {
      parser.addWarning({ code: 'WARN001', message: 'Test warning', severity: 'low' });
      parser.clearWarnings();

      const warnings = parser.getWarnings();

      expect(warnings).toHaveLength(0);
    });
  });
});
