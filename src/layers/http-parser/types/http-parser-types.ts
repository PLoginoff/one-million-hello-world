/**
 * HTTP Parser Types
 * 
 * This module defines all type definitions for the HTTP Parser Layer,
 * including HTTP methods, headers, request/response structures,
 * parsing states, validation rules, and advanced features.
 */

/**
 * HTTP methods as per RFC 7231
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
  CONNECT = 'CONNECT',
}

/**
 * HTTP parsing states
 */
export enum ParserState {
  IDLE = 'IDLE',
  PARSING_REQUEST_LINE = 'PARSING_REQUEST_LINE',
  PARSING_HEADERS = 'PARSING_HEADERS',
  PARSING_BODY = 'PARSING_BODY',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

/**
 * Content encoding types
 */
export enum ContentEncoding {
  GZIP = 'gzip',
  COMPRESS = 'compress',
  DEFLATE = 'deflate',
  BR = 'br',
  IDENTITY = 'identity',
}

/**
 * Content types (MIME types)
 */
export enum ContentType {
  TEXT_PLAIN = 'text/plain',
  TEXT_HTML = 'text/html',
  TEXT_CSS = 'text/css',
  TEXT_JAVASCRIPT = 'text/javascript',
  APPLICATION_JSON = 'application/json',
  APPLICATION_XML = 'application/xml',
  APPLICATION_FORM_URLENCODED = 'application/x-www-form-urlencoded',
  MULTIPART_FORM_DATA = 'multipart/form-data',
  APPLICATION_OCTET_STREAM = 'application/octet-stream',
  IMAGE_PNG = 'image/png',
  IMAGE_JPEG = 'image/jpeg',
  IMAGE_GIF = 'image/gif',
  VIDEO_MP4 = 'video/mp4',
  AUDIO_MPEG = 'audio/mpeg',
}

/**
 * Transfer encoding types
 */
export enum TransferEncoding {
  CHUNKED = 'chunked',
  COMPRESS = 'compress',
  DEFLATE = 'deflate',
  GZIP = 'gzip',
  IDENTITY = 'identity',
}

/**
 * HTTP cache control directives
 */
export enum CacheDirective {
  NO_CACHE = 'no-cache',
  NO_STORE = 'no-store',
  NO_TRANSFORM = 'no-transform',
  MAX_AGE = 'max-age',
  MAX_STALE = 'max-stale',
  MIN_FRESH = 'min-fresh',
  MUST_REVALIDATE = 'must-revalidate',
  PUBLIC = 'public',
  PRIVATE = 'private',
  PROXY_REVALIDATE = 'proxy-revalidate',
  S_MAXAGE = 's-maxage',
}

/**
 * HTTP authentication schemes
 */
export enum AuthScheme {
  BASIC = 'Basic',
  BEARER = 'Bearer',
  DIGEST = 'Digest',
  HOBA = 'HOBA',
  MUTUAL = 'Mutual',
  NEGOTIATE = 'Negotiate',
  OAUTH = 'OAuth',
  SCRAM_SHA1 = 'SCRAM-SHA-1',
  SCRAM_SHA256 = 'SCRAM-SHA-256',
  VAPID = 'vapid',
}

/**
 * HTTP status code categories
 */
export enum HttpStatusCategory {
  INFORMATIONAL = '1xx',
  SUCCESS = '2xx',
  REDIRECTION = '3xx',
  CLIENT_ERROR = '4xx',
  SERVER_ERROR = '5xx',
}

/**
 * HTTP versions
 */
export enum HttpVersion {
  HTTP_1_0 = 'HTTP/1.0',
  HTTP_1_1 = 'HTTP/1.1',
  HTTP_2 = 'HTTP/2',
}

/**
 * HTTP header key-value pair
 */
export interface HttpHeader {
  name: string;
  value: string;
}

/**
 * HTTP headers collection
 */
export type HttpHeaders = Map<string, string>;

/**
 * HTTP request line components
 */
export interface HttpRequestLine {
  method: HttpMethod;
  path: string;
  version: HttpVersion;
  query?: string;
}

/**
 * HTTP status line components
 */
export interface HttpStatusLine {
  version: HttpVersion;
  statusCode: number;
  reasonPhrase: string;
}

/**
 * HTTP request structure
 */
export interface HttpRequest {
  line: HttpRequestLine;
  headers: HttpHeaders;
  body: Buffer;
  raw: Buffer;
}

/**
 * HTTP response structure
 */
export interface HttpResponse {
  line: HttpStatusLine;
  headers: HttpHeaders;
  body: Buffer;
}

/**
 * Parse result with success/failure information
 */
export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: ParseError;
}

/**
 * Parse error details
 */
export interface ParseError {
  code: ParseErrorCode;
  message: string;
  position?: number;
}

/**
 * Parse error codes
 */
export enum ParseErrorCode {
  INVALID_METHOD = 'INVALID_METHOD',
  INVALID_VERSION = 'INVALID_VERSION',
  INVALID_HEADER = 'INVALID_HEADER',
  INVALID_BODY = 'INVALID_BODY',
  MALFORMED_REQUEST = 'MALFORMED_REQUEST',
  INCOMPLETE_DATA = 'INCOMPLETE_DATA',
}

/**
 * Parser configuration options
 */
export interface ParserConfig {
  maxHeaderSize: number;
  maxBodySize: number;
  strictMode: boolean;
  allowChunkedEncoding: boolean;
  maxHeaderCount: number;
  maxUrlLength: number;
  allowHttp2: boolean;
  enableValidation: boolean;
  timeout: number;
  keepAlive: boolean;
  maxConnections: number;
}

/**
 * Extended parser configuration with advanced options
 */
export interface ExtendedParserConfig extends ParserConfig {
  enableCompression: boolean;
  enableDecompression: boolean;
  allowedContentTypes: ContentType[];
  allowedMethods: HttpMethod[];
  allowedOrigins: string[];
  corsEnabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  rateLimitWindow: number;
  securityHeadersEnabled: boolean;
  customHeaders: Map<string, string>;
}

/**
 * Parsing statistics
 */
export interface ParsingStats {
  totalRequestsParsed: number;
  totalBytesParsed: number;
  totalHeadersParsed: number;
  totalBodiesParsed: number;
  averageParseTime: number;
  errorCount: number;
  lastParseTime: number;
  parseErrors: Map<ParseErrorCode, number>;
}

/**
 * Validation rules for HTTP requests
 */
export interface ValidationRules {
  requiredHeaders: string[];
  forbiddenHeaders: string[];
  maxHeaderNameLength: number;
  maxHeaderValueLength: number;
  allowEmptyBody: boolean;
  validateContentType: boolean;
  validateContentLength: boolean;
  validateHost: boolean;
  validateUserAgent: boolean;
}

/**
 * Parsed query parameter
 */
export interface QueryParameter {
  name: string;
  value: string;
}

/**
 * Parsed query string
 */
export interface QueryString {
  parameters: QueryParameter[];
  raw: string;
}

/**
 * Cookie information
 */
export interface Cookie {
  name: string;
  value: string;
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Parsed cookies from request
 */
export interface ParsedCookies {
  cookies: Map<string, Cookie>;
  raw: string;
}

/**
 * MIME type information
 */
export interface MimeType {
  type: string;
  subtype: string;
  charset?: string;
  boundary?: string;
}

/**
 * Content range information
 */
export interface ContentRange {
  unit: string;
  start: number;
  end: number;
  total: number;
}

/**
 * Content disposition information
 */
export interface ContentDisposition {
  type: 'inline' | 'attachment' | 'form-data';
  filename?: string;
  name?: string;
  parameters: Map<string, string>;
}

/**
 * Parse metrics for monitoring
 */
export interface ParseMetrics {
  parseStartTime: number;
  parseEndTime: number;
  parseDuration: number;
  headerParseTime: number;
  bodyParseTime: number;
  validationTime: number;
  memoryUsage: number;
}

/**
 * Parse warning
 */
export interface ParseWarning {
  code: string;
  message: string;
  position?: number;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Extended parse result with warnings and metrics
 */
export interface ExtendedParseResult<T> extends ParseResult<T> {
  warnings?: ParseWarning[];
  metrics?: ParseMetrics;
  stats?: ParsingStats;
}

/**
 * Chunk information for chunked encoding
 */
export interface ChunkInfo {
  size: number;
  extensions: Map<string, string>;
  data: Buffer;
}

/**
 * Multipart form data part
 */
export interface MultipartPart {
  headers: HttpHeaders;
  body: Buffer;
  name?: string;
  filename?: string;
  contentType?: string;
}

/**
 * Parsed multipart form data
 */
export interface MultipartFormData {
  boundary: string;
  parts: MultipartPart[];
}

/**
 * HTTP request with extended information
 */
export interface ExtendedHttpRequest extends HttpRequest {
  query?: QueryString;
  cookies?: ParsedCookies;
  mimeType?: MimeType;
  contentRange?: ContentRange;
  contentDisposition?: ContentDisposition;
  chunks?: ChunkInfo[];
  multipart?: MultipartFormData;
  warnings?: ParseWarning[];
  metrics?: ParseMetrics;
}

/**
 * HTTP response with extended information
 */
export interface ExtendedHttpResponse extends HttpResponse {
  mimeType?: MimeType;
  contentRange?: ContentRange;
  chunks?: ChunkInfo[];
  warnings?: ParseWarning[];
  metrics?: ParseMetrics;
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  enableXFrameOptions: boolean;
  enableXContentTypeOptions: boolean;
  enableXSSProtection: boolean;
  enableStrictTransportSecurity: boolean;
  enableContentSecurityPolicy: boolean;
  enableReferrerPolicy: boolean;
  customSecurityHeaders: Map<string, string>;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowedMethods: HttpMethod[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  allowCredentials: boolean;
  maxAge: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

/**
 * Parser health status
 */
export interface ParserHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  checks: HealthCheck[];
  lastCheck: Date;
}

/**
 * Health check result
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
}

/**
 * Parser diagnostics information
 */
export interface ParserDiagnostics {
  traceId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  steps: DiagnosticStep[];
  summary: DiagnosticSummary;
}

/**
 * Diagnostic step
 */
export interface DiagnosticStep {
  name: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  status: 'success' | 'failure' | 'skipped';
  details: Record<string, unknown>;
}

/**
 * Diagnostic summary
 */
export interface DiagnosticSummary {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  skippedSteps: number;
  overallStatus: 'success' | 'failure' | 'partial';
}
