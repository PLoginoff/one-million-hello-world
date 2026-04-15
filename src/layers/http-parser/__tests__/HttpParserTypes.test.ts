/**
 * HTTP Parser Types Unit Tests
 * 
 * Tests for HTTP Parser Layer type definitions and enums.
 * Validates type safety and enum values.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import {
  HttpMethod,
  HttpVersion,
  ParserState,
  ContentEncoding,
  ContentType,
  TransferEncoding,
  CacheDirective,
  AuthScheme,
  HttpStatusCategory,
} from '../types/http-parser-types';

describe('HTTP Parser Types', () => {
  describe('HttpMethod', () => {
    it('should have GET method', () => {
      expect(HttpMethod.GET).toBe('GET');
    });

    it('should have POST method', () => {
      expect(HttpMethod.POST).toBe('POST');
    });

    it('should have PUT method', () => {
      expect(HttpMethod.PUT).toBe('PUT');
    });

    it('should have DELETE method', () => {
      expect(HttpMethod.DELETE).toBe('DELETE');
    });

    it('should have PATCH method', () => {
      expect(HttpMethod.PATCH).toBe('PATCH');
    });

    it('should have HEAD method', () => {
      expect(HttpMethod.HEAD).toBe('HEAD');
    });

    it('should have OPTIONS method', () => {
      expect(HttpMethod.OPTIONS).toBe('OPTIONS');
    });

    it('should have TRACE method', () => {
      expect(HttpMethod.TRACE).toBe('TRACE');
    });

    it('should have CONNECT method', () => {
      expect(HttpMethod.CONNECT).toBe('CONNECT');
    });
  });

  describe('HttpVersion', () => {
    it('should have HTTP/1.0', () => {
      expect(HttpVersion.HTTP_1_0).toBe('HTTP/1.0');
    });

    it('should have HTTP/1.1', () => {
      expect(HttpVersion.HTTP_1_1).toBe('HTTP/1.1');
    });

    it('should have HTTP/2', () => {
      expect(HttpVersion.HTTP_2).toBe('HTTP/2');
    });
  });

  describe('ParserState', () => {
    it('should have IDLE state', () => {
      expect(ParserState.IDLE).toBe('IDLE');
    });

    it('should have PARSING_REQUEST_LINE state', () => {
      expect(ParserState.PARSING_REQUEST_LINE).toBe('PARSING_REQUEST_LINE');
    });

    it('should have PARSING_HEADERS state', () => {
      expect(ParserState.PARSING_HEADERS).toBe('PARSING_HEADERS');
    });

    it('should have PARSING_BODY state', () => {
      expect(ParserState.PARSING_BODY).toBe('PARSING_BODY');
    });

    it('should have COMPLETE state', () => {
      expect(ParserState.COMPLETE).toBe('COMPLETE');
    });

    it('should have ERROR state', () => {
      expect(ParserState.ERROR).toBe('ERROR');
    });
  });

  describe('ContentEncoding', () => {
    it('should have GZIP encoding', () => {
      expect(ContentEncoding.GZIP).toBe('gzip');
    });

    it('should have COMPRESS encoding', () => {
      expect(ContentEncoding.COMPRESS).toBe('compress');
    });

    it('should have DEFLATE encoding', () => {
      expect(ContentEncoding.DEFLATE).toBe('deflate');
    });

    it('should have BR encoding', () => {
      expect(ContentEncoding.BR).toBe('br');
    });

    it('should have IDENTITY encoding', () => {
      expect(ContentEncoding.IDENTITY).toBe('identity');
    });
  });

  describe('ContentType', () => {
    it('should have TEXT_PLAIN', () => {
      expect(ContentType.TEXT_PLAIN).toBe('text/plain');
    });

    it('should have TEXT_HTML', () => {
      expect(ContentType.TEXT_HTML).toBe('text/html');
    });

    it('should have APPLICATION_JSON', () => {
      expect(ContentType.APPLICATION_JSON).toBe('application/json');
    });

    it('should have MULTIPART_FORM_DATA', () => {
      expect(ContentType.MULTIPART_FORM_DATA).toBe('multipart/form-data');
    });
  });

  describe('TransferEncoding', () => {
    it('should have CHUNKED', () => {
      expect(TransferEncoding.CHUNKED).toBe('chunked');
    });

    it('should have GZIP', () => {
      expect(TransferEncoding.GZIP).toBe('gzip');
    });

    it('should have IDENTITY', () => {
      expect(TransferEncoding.IDENTITY).toBe('identity');
    });
  });

  describe('CacheDirective', () => {
    it('should have NO_CACHE', () => {
      expect(CacheDirective.NO_CACHE).toBe('no-cache');
    });

    it('should have NO_STORE', () => {
      expect(CacheDirective.NO_STORE).toBe('no-store');
    });

    it('should have MAX_AGE', () => {
      expect(CacheDirective.MAX_AGE).toBe('max-age');
    });

    it('should have MUST_REVALIDATE', () => {
      expect(CacheDirective.MUST_REVALIDATE).toBe('must-revalidate');
    });
  });

  describe('AuthScheme', () => {
    it('should have BASIC', () => {
      expect(AuthScheme.BASIC).toBe('Basic');
    });

    it('should have BEARER', () => {
      expect(AuthScheme.BEARER).toBe('Bearer');
    });

    it('should have DIGEST', () => {
      expect(AuthScheme.DIGEST).toBe('Digest');
    });

    it('should have OAUTH', () => {
      expect(AuthScheme.OAUTH).toBe('OAuth');
    });
  });

  describe('HttpStatusCategory', () => {
    it('should have INFORMATIONAL', () => {
      expect(HttpStatusCategory.INFORMATIONAL).toBe('1xx');
    });

    it('should have SUCCESS', () => {
      expect(HttpStatusCategory.SUCCESS).toBe('2xx');
    });

    it('should have REDIRECTION', () => {
      expect(HttpStatusCategory.REDIRECTION).toBe('3xx');
    });

    it('should have CLIENT_ERROR', () => {
      expect(HttpStatusCategory.CLIENT_ERROR).toBe('4xx');
    });

    it('should have SERVER_ERROR', () => {
      expect(HttpStatusCategory.SERVER_ERROR).toBe('5xx');
    });
  });
});
