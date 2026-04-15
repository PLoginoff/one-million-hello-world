/**
 * HTTP Request Parser Interface
 * 
 * Defines the contract for parsing raw HTTP request data
 * into structured HttpRequest objects.
 */

import {
  HttpRequest,
  ParseResult,
  ParserConfig,
  ExtendedParserConfig,
  ExtendedParseResult,
  ExtendedHttpRequest,
  QueryString,
  ParsedCookies,
  MimeType,
  ContentDisposition,
  ChunkInfo,
  MultipartFormData,
  ParsingStats,
  ValidationRules,
  ParserState,
  ParseWarning,
  ParserHealthStatus,
  ParserDiagnostics,
  SecurityHeadersConfig,
  CorsConfig,
  RateLimitConfig,
  HttpMethod,
  HttpResponse,
  ExtendedHttpResponse,
} from '../types/http-parser-types';

/**
 * Interface for parsing HTTP requests
 */
export interface IHttpRequestParser {
  /**
   * Parses raw HTTP request data
   * 
   * @param raw - Raw buffer containing HTTP request data
   * @param config - Parser configuration options
   * @returns Parse result with success/failure information
   */
  parse(raw: Buffer, config?: ParserConfig): ParseResult<HttpRequest>;

  /**
   * Parses only the request line (first line of HTTP request)
   * 
   * @param line - Request line string
   * @returns Parse result with request line components
   */
  parseRequestLine(line: string): ParseResult<{
    method: string;
    path: string;
    version: string;
  }>;

  /**
   * Parses HTTP headers
   * 
   * @param headerLines - Array of header lines
   * @returns Parse result with headers map
   */
  parseHeaders(headerLines: string[]): ParseResult<Map<string, string>>;

  /**
   * Validates HTTP request structure
   * 
   * @param request - Request to validate
   * @returns True if valid, false otherwise
   */
  validate(request: HttpRequest): boolean;

  /**
   * Sets default parser configuration
   * 
   * @param config - Default configuration
   */
  setDefaultConfig(config: ParserConfig): void;

  /**
   * Gets current default configuration
   * 
   * @returns Current default configuration
   */
  getDefaultConfig(): ParserConfig;

  /**
   * Parses with extended configuration and returns extended result
   * 
   * @param raw - Raw buffer containing HTTP request data
   * @param config - Extended parser configuration options
   * @returns Extended parse result with warnings and metrics
   */
  parseExtended(raw: Buffer, config?: ExtendedParserConfig): ExtendedParseResult<ExtendedHttpRequest>;

  /**
   * Parses query string from URL
   * 
   * @param queryString - Query string to parse
   * @returns Parsed query string
   */
  parseQueryString(queryString: string): QueryString;

  /**
   * Parses cookies from Cookie header
   * 
   * @param cookieHeader - Cookie header value
   * @returns Parsed cookies
   */
  parseCookies(cookieHeader: string): ParsedCookies;

  /**
   * Parses MIME type from Content-Type header
   * 
   * @param contentType - Content-Type header value
   * @returns Parsed MIME type
   */
  parseMimeType(contentType: string): MimeType | null;

  /**
   * Parses Content-Disposition header
   * 
   * @param contentDisposition - Content-Disposition header value
   * @returns Parsed content disposition
   */
  parseContentDisposition(contentDisposition: string): ContentDisposition | null;

  /**
   * Parses chunked encoding body
   * 
   * @param body - Body buffer with chunked encoding
   * @returns Array of chunk information
   */
  parseChunkedEncoding(body: Buffer): ChunkInfo[];

  /**
   * Parses multipart form data
   * 
   * @param body - Body buffer with multipart form data
   * @param boundary - Multipart boundary
   * @returns Parsed multipart form data
   */
  parseMultipartFormData(body: Buffer, boundary: string): MultipartFormData;

  /**
   * Gets parsing statistics
   * 
   * @returns Parsing statistics
   */
  getStats(): ParsingStats;

  /**
   * Resets parsing statistics
   */
  resetStats(): void;

  /**
   * Gets current parser state
   * 
   * @returns Current parser state
   */
  getState(): ParserState;

  /**
   * Sets validation rules
   * 
   * @param rules - Validation rules to apply
   */
  setValidationRules(rules: ValidationRules): void;

  /**
   * Gets current validation rules
   * 
   * @returns Current validation rules
   */
  getValidationRules(): ValidationRules;

  /**
   * Validates HTTP response
   * 
   * @param response - Response to validate
   * @returns True if valid, false otherwise
   */
  validateResponse(response: HttpResponse): boolean;

  /**
   * Parses HTTP response
   * 
   * @param raw - Raw buffer containing HTTP response data
   * @param config - Parser configuration options
   * @returns Parse result with success/failure information
   */
  parseResponse(raw: Buffer, config?: ParserConfig): ParseResult<HttpResponse>;

  /**
   * Parses HTTP response with extended information
   * 
   * @param raw - Raw buffer containing HTTP response data
   * @param config - Extended parser configuration options
   * @returns Extended parse result with warnings and metrics
   */
  parseResponseExtended(raw: Buffer, config?: ExtendedParserConfig): ExtendedParseResult<ExtendedHttpResponse>;

  /**
   * Gets parser health status
   * 
   * @returns Parser health status
   */
  getHealthStatus(): ParserHealthStatus;

  /**
   * Runs parser diagnostics
   * 
   * @returns Parser diagnostics information
   */
  runDiagnostics(): ParserDiagnostics;

  /**
   * Sets security headers configuration
   * 
   * @param config - Security headers configuration
   */
  setSecurityHeadersConfig(config: SecurityHeadersConfig): void;

  /**
   * Gets security headers configuration
   * 
   * @returns Security headers configuration
   */
  getSecurityHeadersConfig(): SecurityHeadersConfig;

  /**
   * Sets CORS configuration
   * 
   * @param config - CORS configuration
   */
  setCorsConfig(config: CorsConfig): void;

  /**
   * Gets CORS configuration
   * 
   * @returns CORS configuration
   */
  getCorsConfig(): CorsConfig;

  /**
   * Sets rate limiting configuration
   * 
   * @param config - Rate limiting configuration
   */
  setRateLimitConfig(config: RateLimitConfig): void;

  /**
   * Gets rate limiting configuration
   * 
   * @returns Rate limiting configuration
   */
  getRateLimitConfig(): RateLimitConfig;

  /**
   * Checks if method is allowed
   * 
   * @param method - HTTP method to check
   * @returns True if allowed, false otherwise
   */
  isMethodAllowed(method: HttpMethod): boolean;

  /**
   * Checks if content type is allowed
   * 
   * @param contentType - Content type to check
   * @returns True if allowed, false otherwise
   */
  isContentTypeAllowed(contentType: string): boolean;

  /**
   * Checks if origin is allowed
   * 
   * @param origin - Origin to check
   * @returns True if allowed, false otherwise
   */
  isOriginAllowed(origin: string): boolean;

  /**
   * Adds parse warning
   * 
   * @param warning - Parse warning to add
   */
  addWarning(warning: ParseWarning): void;

  /**
   * Clears all warnings
   */
  clearWarnings(): void;

  /**
   * Gets all warnings
   * 
   * @returns Array of parse warnings
   */
  getWarnings(): ParseWarning[];

  /**
   * Resets parser state
   */
  resetState(): void;

  /**
   * Gets extended default configuration
   * 
   * @returns Extended default configuration
   */
  getExtendedDefaultConfig(): ExtendedParserConfig;

  /**
   * Sets extended default configuration
   * 
   * @param config - Extended default configuration
   */
  setExtendedDefaultConfig(config: ExtendedParserConfig): void;
}
