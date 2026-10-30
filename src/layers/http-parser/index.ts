/**
 * HTTP Parser Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the HTTP Parser Layer (Layer 2 of the 25-layer architecture).
 *
 * The HTTP Parser Layer provides request parsing, headers parsing,
 * and validation of HTTP protocol data.
 *
 * @module HttpParserLayer
 */

export { IHttpRequestParser } from './interfaces/IHttpRequestParser';
export { HttpRequestParser } from './implementations/HttpRequestParser';

// Types - explicitly export to avoid conflicts
export {
  HttpMethod,
  ParserState,
  ContentEncoding,
  ContentType,
  TransferEncoding,
  CacheDirective,
  AuthScheme,
  HttpStatusCategory,
  HttpVersion,
  HttpHeader,
  HttpHeaders,
  HttpRequestLine,
  HttpStatusLine,
  HttpRequest,
  HttpResponse,
  ParseResult,
  ParseError,
  ParseErrorCode,
  ParserConfig,
  ExtendedParserConfig,
  ParsingStats,
  ValidationRules,
  QueryParameter,
  QueryString,
  Cookie,
  ParsedCookies,
  MimeType,
  ContentRange,
  ContentDisposition,
  ParseMetrics,
  ParseWarning,
  ExtendedParseResult,
  ChunkInfo,
  MultipartPart,
  MultipartFormData,
  ExtendedHttpRequest,
  ExtendedHttpResponse,
  SecurityHeadersConfig,
  CorsConfig,
  RateLimitConfig,
  ParserHealthStatus,
  HealthCheck,
  ParserDiagnostics,
  DiagnosticStep,
  DiagnosticSummary,
} from './types/http-parser-types';

// Domain
export { HttpParserConfigState, HttpParserConfigStateData } from './domain/entities/HttpParserConfigState';
export { HttpHeaderEntity } from './domain/entities/HttpHeaderEntity';
export { HttpRequestEntity } from './domain/entities/HttpRequestEntity';
export { HttpResponseEntity } from './domain/entities/HttpResponseEntity';
export { HttpParserExecution, HttpParserExecutionData } from './domain/entities/HttpParserExecution';
export { HttpParserMetricsSnapshot, HttpParserMetricsSnapshotData } from './domain/entities/HttpParserMetricsSnapshot';

// Configuration
export { HttpParserConfigurationBuilder } from './configuration/builders/HttpParserConfigurationBuilder';
export { HttpParserDEFAULTS } from './configuration/defaults/HttpParserDefaults';
export { HttpParserConfigurationValidator } from './configuration/validators/HttpParserConfigurationValidator';

// Strategies
export { HttpParserDefaultStrategy } from './strategies/DefaultStrategy';
export { HttpParserFastStrategy } from './strategies/FastStrategy';
export { HttpParserReliableStrategy } from './strategies/ReliableStrategy';
export { HttpParserCachedStrategy } from './strategies/CachedStrategy';
export { HttpParserBatchStrategy } from './strategies/BatchStrategy';
export {
  HttpParserLoggingStrategy,
  HttpParserLoggingStrategyOptions,
  HttpParserLogger,
  HttpParserLoggingStrategyFactory,
} from './strategies/LoggingStrategy';
export {
  HttpParserMetricsStrategy,
  HttpParserMetricsStrategyOptions,
  HttpParserMetricsStrategyFactory,
} from './strategies/MetricsStrategy';
export { IHttpParserStrategy, HttpParserStrategyContext, StrategyResult } from './strategies/IHttpParserStrategy';
export { DefaultHttpParserStrategy } from './strategies/DefaultHttpParserStrategy';
export {
  LoggingHttpParserStrategy,
  LoggingHttpParserStrategyOptions,
  LoggingHttpParserStrategyFactory,
} from './strategies/LoggingHttpParserStrategy';
export {
  MetricsHttpParserStrategy,
  MetricsHttpParserStrategyOptions,
  MetricsHttpParserStrategyFactory,
} from './strategies/MetricsHttpParserStrategy';

// Factories
export { HttpParserStrategyFactory } from './factories/HttpParserStrategyFactory';

// Adapters
// export { HttpParserNodeAdapter } from './adapters/NodeHttpAdapter'; // TODO: fix type issues

// Health
export { HttpParserHealthCheck } from './health/HttpParserHealthCheck';

// Errors
export {
  HttpParserError,
  HttpParserErrorCode,
  HttpParserErrorContext,
  HttpParserConfigurationError,
  HttpParserExecutionError,
  HttpParserTimeoutError,
  HttpParserValidationError,
  HttpParserParseError,
  HttpParserInvalidRequestLineError,
  HttpParserInvalidHeadersError,
  HttpParserInvalidBodyError,
  HttpParserUnsupportedMethodError,
  HttpParserUnsupportedVersionError,
  HttpParserHeaderTooLargeError,
  HttpParserBodyTooLargeError,
  HttpParserTooManyHeadersError,
  HttpParserUrlTooLongError,
  HttpParserChunkedEncodingError,
  HttpParserMultipartError,
  HttpParserIncompleteRequestError,
  HttpParserInvalidContentLengthError,
  HttpParserInvalidTransferEncodingError,
  HttpParserErrorFactory,
} from './errors';export * from "./engine";
