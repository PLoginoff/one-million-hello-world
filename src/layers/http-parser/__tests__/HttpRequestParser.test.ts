/**
 * HTTP Request Parser Unit Tests
 * 
 * Tests for HttpRequestParser implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { HttpRequestParser } from '../implementations/HttpRequestParser';
import { HttpMethod, HttpVersion, ParseErrorCode } from '../types/http-parser-types';

describe('HttpRequestParser', () => {
  let parser: HttpRequestParser;

  beforeEach(() => {
    parser = new HttpRequestParser();
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const config = parser.getDefaultConfig();

      expect(config).toBeDefined();
      expect(config.maxHeaderSize).toBe(8192);
      expect(config.maxBodySize).toBe(10485760);
      expect(config.strictMode).toBe(true);
      expect(config.allowChunkedEncoding).toBe(true);
    });
  });

  describe('setDefaultConfig', () => {
    it('should update default configuration', () => {
      const newConfig = {
        maxHeaderSize: 16384,
        maxBodySize: 20971520,
        strictMode: false,
        allowChunkedEncoding: false,
      };

      parser.setDefaultConfig(newConfig);
      const config = parser.getDefaultConfig();

      expect(config.maxHeaderSize).toBe(16384);
      expect(config.maxBodySize).toBe(20971520);
      expect(config.strictMode).toBe(false);
      expect(config.allowChunkedEncoding).toBe(false);
    });
  });

  describe('parseRequestLine', () => {
    it('should parse valid GET request line', () => {
      const result = parser.parseRequestLine('GET / HTTP/1.1');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.method).toBe(HttpMethod.GET);
      expect(result.data?.path).toBe('/');
      expect(result.data?.version).toBe(HttpVersion.HTTP_1_1);
    });

    it('should parse valid POST request line', () => {
      const result = parser.parseRequestLine('POST /api/users HTTP/1.1');

      expect(result.success).toBe(true);
      expect(result.data?.method).toBe(HttpMethod.POST);
      expect(result.data?.path).toBe('/api/users');
    });

    it('should fail with invalid HTTP method', () => {
      const result = parser.parseRequestLine('INVALID / HTTP/1.1');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ParseErrorCode.INVALID_METHOD);
    });

    it('should fail with invalid HTTP version', () => {
      const result = parser.parseRequestLine('GET / HTTP/3.0');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ParseErrorCode.INVALID_VERSION);
    });

    it('should fail with malformed request line', () => {
      const result = parser.parseRequestLine('GET /');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ParseErrorCode.MALFORMED_REQUEST);
    });
  });

  describe('parseHeaders', () => {
    it('should parse valid headers', () => {
      const headers = ['Content-Type: application/json', 'Content-Length: 100'];
      const result = parser.parseHeaders(headers);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.get('content-type')).toBe('application/json');
      expect(result.data?.get('content-length')).toBe('100');
    });

    it('should normalize header names to lowercase', () => {
      const headers = ['Content-Type: application/json'];
      const result = parser.parseHeaders(headers);

      expect(result.success).toBe(true);
      expect(result.data?.get('content-type')).toBe('application/json');
    });

    it('should handle empty header lines', () => {
      const headers = ['Content-Type: application/json', '', 'Content-Length: 100'];
      const result = parser.parseHeaders(headers);

      expect(result.success).toBe(true);
      expect(result.data?.size).toBe(2);
    });

    it('should fail with invalid header format', () => {
      const headers = ['InvalidHeader'];
      const result = parser.parseHeaders(headers);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ParseErrorCode.INVALID_HEADER);
    });

    it('should fail with empty header name', () => {
      const headers = [': value'];
      const result = parser.parseHeaders(headers);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ParseErrorCode.INVALID_HEADER);
    });
  });

  describe('parse', () => {
    it('should parse valid GET request', () => {
      const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n');
      const result = parser.parse(raw);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.line.method).toBe(HttpMethod.GET);
      expect(result.data?.line.path).toBe('/');
      expect(result.data?.headers.get('host')).toBe('localhost');
    });

    it('should parse request with body', () => {
      const raw = Buffer.from(
        'POST /api/users HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"name":"test"}'
      );
      const result = parser.parse(raw);

      expect(result.success).toBe(true);
      expect(result.data?.body.toString()).toBe('{"name":"test"}');
    });

    it('should fail with empty request', () => {
      const raw = Buffer.from('');
      const result = parser.parse(raw);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ParseErrorCode.MALFORMED_REQUEST);
    });

    it('should fail when body size exceeds limit', () => {
      const largeBody = 'x'.repeat(20000000);
      const raw = Buffer.from(`POST / HTTP/1.1\r\nContent-Length: 20000000\r\n\r\n${largeBody}`);
      const config = { maxBodySize: 1000, strictMode: false, allowChunkedEncoding: true, maxHeaderSize: 8192 };
      const result = parser.parse(raw, config);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ParseErrorCode.INVALID_BODY);
    });
  });

  describe('validate', () => {
    it('should validate valid request', () => {
      const request = {
        line: {
          method: HttpMethod.GET,
          path: '/',
          version: HttpVersion.HTTP_1_1,
        },
        headers: new Map([['host', 'localhost']]),
        body: Buffer.from(''),
        raw: Buffer.from(''),
      };

      expect(parser.validate(request)).toBe(true);
    });

    it('should fail validation with invalid method', () => {
      const request = {
        line: {
          method: 'INVALID' as HttpMethod,
          path: '/',
          version: HttpVersion.HTTP_1_1,
        },
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from(''),
      };

      expect(parser.validate(request)).toBe(false);
    });

    it('should fail validation with missing line', () => {
      const request = {
        line: {} as any,
        headers: new Map(),
        body: Buffer.from(''),
        raw: Buffer.from(''),
      };

      expect(parser.validate(request)).toBe(false);
    });
  });
});
