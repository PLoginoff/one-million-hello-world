/**
 * HTTP Parser Error Taxonomy
 *
 * Base error class and specific error types for the HTTP Parser Layer.
 * Provides structured error handling with error codes and context.
 *
 * @module HttpParserLayer/Errors
 */

export type HttpParserErrorCode =
  | 'HTTP_PARSER_CONFIGURATION_ERROR'
  | 'HTTP_PARSER_EXECUTION_ERROR'
  | 'HTTP_PARSER_TIMEOUT_ERROR'
  | 'HTTP_PARSER_VALIDATION_ERROR'
  | 'HTTP_PARSER_PARSE_ERROR'
  | 'HTTP_PARSER_INVALID_REQUEST_LINE'
  | 'HTTP_PARSER_INVALID_HEADERS'
  | 'HTTP_PARSER_INVALID_BODY'
  | 'HTTP_PARSER_UNSUPPORTED_METHOD'
  | 'HTTP_PARSER_UNSUPPORTED_VERSION'
  | 'HTTP_PARSER_HEADER_TOO_LARGE'
  | 'HTTP_PARSER_BODY_TOO_LARGE'
  | 'HTTP_PARSER_TOO_MANY_HEADERS'
  | 'HTTP_PARSER_URL_TOO_LONG'
  | 'HTTP_PARSER_CHUNKED_ENCODING_ERROR'
  | 'HTTP_PARSER_MULTIPART_ERROR'
  | 'HTTP_PARSER_TIMEOUT'
  | 'HTTP_PARSER_INCOMPLETE_REQUEST'
  | 'HTTP_PARSER_INVALID_CONTENT_LENGTH'
  | 'HTTP_PARSER_INVALID_TRANSFER_ENCODING';

export interface HttpParserErrorContext {
  readonly operation?: string;
  readonly parserState?: string;
  readonly bytesProcessed?: number;
  readonly totalBytes?: number;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Base HTTP Parser Error Class
 *
 * All HTTP parser-related errors inherit from this class.
 * Provides consistent error structure with codes and context.
 */
export class HttpParserError extends Error {
  public readonly code: HttpParserErrorCode;
  public readonly context: HttpParserErrorContext;
  public override readonly cause?: Error;
  public readonly isOperational: boolean;

  constructor(
    code: HttpParserErrorCode,
    message: string,
    context: Partial<HttpParserErrorContext> = {},
    cause?: Error
  ) {
    super(message);
    this.name = 'HttpParserError';
    this.code = code;
    this.context = {
      timestamp: Date.now(),
      ...context,
    };
    this.cause = cause;
    this.isOperational = true;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
      isOperational: this.isOperational,
    };
  }

  isCode(code: HttpParserErrorCode): boolean {
    return this.code === code;
  }

  isOperationalError(): boolean {
    return this.isOperational;
  }
}

/**
 * Configuration Error
 *
 * Thrown when HTTP parser configuration is invalid or missing.
 */
export class HttpParserConfigurationError extends HttpParserError {
  constructor(message: string, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super('HTTP_PARSER_CONFIGURATION_ERROR', message, context, cause);
    this.name = 'HttpParserConfigurationError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserConfigurationError);
    }
  }

  static invalidConfig(
    field: string,
    value: unknown,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserConfigurationError {
    return new HttpParserConfigurationError(`Invalid HTTP parser configuration: ${field} = ${JSON.stringify(value)}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field, value },
    });
  }

  static missingConfig(field: string, context?: Partial<HttpParserErrorContext>): HttpParserConfigurationError {
    return new HttpParserConfigurationError(`Missing required HTTP parser configuration: ${field}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field },
    });
  }

  static invalidMaxHeaderSize(size: number, context?: Partial<HttpParserErrorContext>): HttpParserConfigurationError {
    return new HttpParserConfigurationError(`Invalid max header size: ${size}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field: 'maxHeaderSize', value: size },
    });
  }

  static invalidMaxBodySize(size: number, context?: Partial<HttpParserErrorContext>): HttpParserConfigurationError {
    return new HttpParserConfigurationError(`Invalid max body size: ${size}`, {
      ...context,
      operation: 'validate-config',
      metadata: { field: 'maxBodySize', value: size },
    });
  }
}

/**
 * Execution Error
 *
 * Thrown when an HTTP parser operation fails during execution.
 */
export class HttpParserExecutionError extends HttpParserError {
  constructor(message: string, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super('HTTP_PARSER_EXECUTION_ERROR', message, context, cause);
    this.name = 'HttpParserExecutionError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserExecutionError);
    }
  }

  static operationFailed(
    operation: string,
    reason: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserExecutionError {
    return new HttpParserExecutionError(
      `HTTP parser operation '${operation}' failed: ${reason}`,
      { ...context, operation, metadata: { reason } },
      cause
    );
  }

  static strategyExecutionFailed(
    strategy: string,
    reason: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserExecutionError {
    return new HttpParserExecutionError(
      `HTTP parser strategy '${strategy}' execution failed: ${reason}`,
      { ...context, operation: 'execute-strategy', metadata: { strategy, reason } },
      cause
    );
  }

  static parseFailed(
    reason: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserExecutionError {
    return new HttpParserExecutionError(
      `HTTP parse failed: ${reason}`,
      { ...context, operation: 'parse', metadata: { reason } },
      cause
    );
  }
}

/**
 * Timeout Error
 *
 * Thrown when an HTTP parser operation exceeds its time limit.
 */
export class HttpParserTimeoutError extends HttpParserError {
  public readonly timeoutMs: number;
  public readonly operation: string;

  constructor(operation: string, timeoutMs: number, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_TIMEOUT',
      `HTTP parser operation '${operation}' timed out after ${timeoutMs}ms`,
      { ...context, operation, metadata: { timeoutMs } },
      cause
    );
    this.name = 'HttpParserTimeoutError';
    this.timeoutMs = timeoutMs;
    this.operation = operation;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserTimeoutError);
    }
  }

  static parseTimeout(timeoutMs: number, context?: Partial<HttpParserErrorContext>): HttpParserTimeoutError {
    return new HttpParserTimeoutError('parse', timeoutMs, context);
  }

  static headerParseTimeout(timeoutMs: number, context?: Partial<HttpParserErrorContext>): HttpParserTimeoutError {
    return new HttpParserTimeoutError('parse-headers', timeoutMs, context);
  }

  static bodyParseTimeout(timeoutMs: number, context?: Partial<HttpParserErrorContext>): HttpParserTimeoutError {
    return new HttpParserTimeoutError('parse-body', timeoutMs, context);
  }

  static validationTimeout(timeoutMs: number, context?: Partial<HttpParserErrorContext>): HttpParserTimeoutError {
    return new HttpParserTimeoutError('validate', timeoutMs, context);
  }
}

/**
 * Validation Error
 *
 * Thrown when HTTP parser validation fails.
 */
export class HttpParserValidationError extends HttpParserError {
  public readonly field: string;
  public readonly value: unknown;
  public readonly constraint: string;

  constructor(
    field: string,
    value: unknown,
    constraint: string,
    context: Partial<HttpParserErrorContext> = {},
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_VALIDATION_ERROR',
      `HTTP parser validation failed for '${field}': ${constraint}`,
      { ...context, operation: 'validate', metadata: { field, value, constraint } },
      cause
    );
    this.name = 'HttpParserValidationError';
    this.field = field;
    this.value = value;
    this.constraint = constraint;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserValidationError);
    }
  }

  static invalidField(
    field: string,
    value: unknown,
    constraint: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserValidationError {
    return new HttpParserValidationError(field, value, constraint, context);
  }

  static missingField(field: string, context?: Partial<HttpParserErrorContext>): HttpParserValidationError {
    return new HttpParserValidationError(field, undefined, 'field is required', context);
  }

  static invalidMethod(method: string, context?: Partial<HttpParserErrorContext>): HttpParserValidationError {
    return new HttpParserValidationError('method', method, 'must be a valid HTTP method', context);
  }

  static invalidVersion(version: string, context?: Partial<HttpParserErrorContext>): HttpParserValidationError {
    return new HttpParserValidationError('version', version, 'must be a valid HTTP version (e.g., HTTP/1.1)', context);
  }

  static invalidHeader(
    name: string,
    value: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserValidationError {
    return new HttpParserValidationError('header', { name, value }, 'header name and value must be valid', context);
  }
}

/**
 * Parse Error
 *
 * Base class for parse-specific errors.
 */
export class HttpParserParseError extends HttpParserError {
  public readonly parserState: string;
  public readonly bytesProcessed: number;
  public readonly totalBytes: number;

  constructor(
    code: HttpParserErrorCode,
    message: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context: Partial<HttpParserErrorContext> = {},
    cause?: Error
  ) {
    super(code, message, { ...context, parserState, bytesProcessed, totalBytes }, cause);
    this.name = 'HttpParserParseError';
    this.parserState = parserState;
    this.bytesProcessed = bytesProcessed;
    this.totalBytes = totalBytes;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserParseError);
    }
  }
}

/**
 * Invalid Request Line Error
 *
 * Thrown when the HTTP request line is invalid.
 */
export class HttpParserInvalidRequestLineError extends HttpParserParseError {
  public readonly requestLine: string;

  constructor(
    requestLine: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_INVALID_REQUEST_LINE',
      `Invalid HTTP request line: ${requestLine}`,
      parserState,
      bytesProcessed,
      totalBytes,
      { ...context, operation: 'parse-request-line', metadata: { requestLine } },
      cause
    );
    this.name = 'HttpParserInvalidRequestLineError';
    this.requestLine = requestLine;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserInvalidRequestLineError);
    }
  }

  static malformed(
    requestLine: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidRequestLineError {
    return new HttpParserInvalidRequestLineError(requestLine, parserState, bytesProcessed, totalBytes, context);
  }

  static missingMethod(
    requestLine: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidRequestLineError {
    return new HttpParserInvalidRequestLineError(requestLine, parserState, bytesProcessed, totalBytes, context);
  }

  static missingPath(
    requestLine: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidRequestLineError {
    return new HttpParserInvalidRequestLineError(requestLine, parserState, bytesProcessed, totalBytes, context);
  }

  static missingVersion(
    requestLine: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidRequestLineError {
    return new HttpParserInvalidRequestLineError(requestLine, parserState, bytesProcessed, totalBytes, context);
  }
}

/**
 * Invalid Headers Error
 *
 * Thrown when HTTP headers are invalid.
 */
export class HttpParserInvalidHeadersError extends HttpParserParseError {
  public readonly headerLines: string[];
  public readonly failedAtLine: number;

  constructor(
    headerLines: string[],
    failedAtLine: number,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_INVALID_HEADERS',
      `Invalid HTTP headers at line ${failedAtLine}`,
      parserState,
      bytesProcessed,
      totalBytes,
      { ...context, operation: 'parse-headers', metadata: { headerLines, failedAtLine } },
      cause
    );
    this.name = 'HttpParserInvalidHeadersError';
    this.headerLines = headerLines;
    this.failedAtLine = failedAtLine;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserInvalidHeadersError);
    }
  }

  static malformedHeader(
    headerLine: string,
    lineNumber: number,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidHeadersError {
    return new HttpParserInvalidHeadersError(
      [headerLine],
      lineNumber,
      parserState,
      bytesProcessed,
      totalBytes,
      context
    );
  }

  static duplicateHeader(
    headerName: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidHeadersError {
    return new HttpParserInvalidHeadersError([], 0, parserState, bytesProcessed, totalBytes, {
      ...context,
      metadata: { duplicateHeader: headerName },
    });
  }

  static tooManyHeaders(
    headerCount: number,
    maxHeaders: number,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidHeadersError {
    return new HttpParserInvalidHeadersError([], 0, parserState, bytesProcessed, totalBytes, {
      ...context,
      metadata: { headerCount, maxHeaders },
    });
  }
}

/**
 * Invalid Body Error
 *
 * Thrown when HTTP body is invalid.
 */
export class HttpParserInvalidBodyError extends HttpParserParseError {
  public readonly expectedLength?: number;
  public readonly actualLength: number;

  constructor(
    actualLength: number,
    expectedLength: number | undefined,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_INVALID_BODY',
      `Invalid HTTP body: expected ${expectedLength ?? 'unknown'} bytes, got ${actualLength}`,
      parserState,
      bytesProcessed,
      totalBytes,
      { ...context, operation: 'parse-body', metadata: { expectedLength, actualLength } },
      cause
    );
    this.name = 'HttpParserInvalidBodyError';
    this.expectedLength = expectedLength;
    this.actualLength = actualLength;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserInvalidBodyError);
    }
  }

  static bodyTooLarge(
    actualLength: number,
    maxLength: number,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidBodyError {
    return new HttpParserInvalidBodyError(actualLength, maxLength, parserState, bytesProcessed, totalBytes, context);
  }

  static incompleteBody(
    expectedLength: number,
    actualLength: number,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidBodyError {
    return new HttpParserInvalidBodyError(
      actualLength,
      expectedLength,
      parserState,
      bytesProcessed,
      totalBytes,
      context
    );
  }

  static contentLengthMismatch(
    expectedLength: number,
    actualLength: number,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidBodyError {
    return new HttpParserInvalidBodyError(
      actualLength,
      expectedLength,
      parserState,
      bytesProcessed,
      totalBytes,
      context
    );
  }
}

/**
 * Unsupported Method Error
 *
 * Thrown when HTTP method is not supported.
 */
export class HttpParserUnsupportedMethodError extends HttpParserError {
  public readonly method: string;
  public readonly supportedMethods: string[];

  constructor(
    method: string,
    supportedMethods: string[],
    context: Partial<HttpParserErrorContext> = {},
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_UNSUPPORTED_METHOD',
      `Unsupported HTTP method: ${method}. Supported: ${supportedMethods.join(', ')}`,
      { ...context, operation: 'validate-method', metadata: { method, supportedMethods } },
      cause
    );
    this.name = 'HttpParserUnsupportedMethodError';
    this.method = method;
    this.supportedMethods = supportedMethods;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserUnsupportedMethodError);
    }
  }
}

/**
 * Unsupported Version Error
 *
 * Thrown when HTTP version is not supported.
 */
export class HttpParserUnsupportedVersionError extends HttpParserError {
  public readonly version: string;
  public readonly supportedVersions: string[];

  constructor(
    version: string,
    supportedVersions: string[],
    context: Partial<HttpParserErrorContext> = {},
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_UNSUPPORTED_VERSION',
      `Unsupported HTTP version: ${version}. Supported: ${supportedVersions.join(', ')}`,
      { ...context, operation: 'validate-version', metadata: { version, supportedVersions } },
      cause
    );
    this.name = 'HttpParserUnsupportedVersionError';
    this.version = version;
    this.supportedVersions = supportedVersions;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserUnsupportedVersionError);
    }
  }
}

/**
 * Header Too Large Error
 *
 * Thrown when HTTP headers exceed size limit.
 */
export class HttpParserHeaderTooLargeError extends HttpParserError {
  public readonly headerSize: number;
  public readonly maxHeaderSize: number;

  constructor(headerSize: number, maxHeaderSize: number, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_HEADER_TOO_LARGE',
      `HTTP headers too large: ${headerSize} bytes (max: ${maxHeaderSize})`,
      { ...context, operation: 'validate-header-size', metadata: { headerSize, maxHeaderSize } },
      cause
    );
    this.name = 'HttpParserHeaderTooLargeError';
    this.headerSize = headerSize;
    this.maxHeaderSize = maxHeaderSize;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserHeaderTooLargeError);
    }
  }
}

/**
 * Body Too Large Error
 *
 * Thrown when HTTP body exceeds size limit.
 */
export class HttpParserBodyTooLargeError extends HttpParserError {
  public readonly bodySize: number;
  public readonly maxBodySize: number;

  constructor(bodySize: number, maxBodySize: number, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_BODY_TOO_LARGE',
      `HTTP body too large: ${bodySize} bytes (max: ${maxBodySize})`,
      { ...context, operation: 'validate-body-size', metadata: { bodySize, maxBodySize } },
      cause
    );
    this.name = 'HttpParserBodyTooLargeError';
    this.bodySize = bodySize;
    this.maxBodySize = maxBodySize;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserBodyTooLargeError);
    }
  }
}

/**
 * Too Many Headers Error
 *
 * Thrown when HTTP request has too many headers.
 */
export class HttpParserTooManyHeadersError extends HttpParserError {
  public readonly headerCount: number;
  public readonly maxHeaders: number;

  constructor(headerCount: number, maxHeaders: number, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_TOO_MANY_HEADERS',
      `Too many HTTP headers: ${headerCount} (max: ${maxHeaders})`,
      { ...context, operation: 'validate-header-count', metadata: { headerCount, maxHeaders } },
      cause
    );
    this.name = 'HttpParserTooManyHeadersError';
    this.headerCount = headerCount;
    this.maxHeaders = maxHeaders;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserTooManyHeadersError);
    }
  }
}

/**
 * URL Too Long Error
 *
 * Thrown when HTTP URL exceeds length limit.
 */
export class HttpParserUrlTooLongError extends HttpParserError {
  public readonly urlLength: number;
  public readonly maxUrlLength: number;
  public readonly url: string;

  constructor(
    url: string,
    urlLength: number,
    maxUrlLength: number,
    context: Partial<HttpParserErrorContext> = {},
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_URL_TOO_LONG',
      `HTTP URL too long: ${urlLength} characters (max: ${maxUrlLength})`,
      {
        ...context,
        operation: 'validate-url-length',
        metadata: { urlLength, maxUrlLength, url: url.substring(0, 100) },
      },
      cause
    );
    this.name = 'HttpParserUrlTooLongError';
    this.urlLength = urlLength;
    this.maxUrlLength = maxUrlLength;
    this.url = url;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserUrlTooLongError);
    }
  }
}

/**
 * Chunked Encoding Error
 *
 * Thrown when chunked encoding parsing fails.
 */
export class HttpParserChunkedEncodingError extends HttpParserError {
  public readonly chunkData: string;
  public readonly reason: string;

  constructor(chunkData: string, reason: string, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_CHUNKED_ENCODING_ERROR',
      `Chunked encoding error: ${reason}`,
      { ...context, operation: 'parse-chunked', metadata: { chunkData: chunkData.substring(0, 200), reason } },
      cause
    );
    this.name = 'HttpParserChunkedEncodingError';
    this.chunkData = chunkData;
    this.reason = reason;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserChunkedEncodingError);
    }
  }

  static invalidChunkSize(
    chunkData: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserChunkedEncodingError {
    return new HttpParserChunkedEncodingError(chunkData, 'Invalid chunk size', context);
  }

  static missingChunkTerminator(
    chunkData: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserChunkedEncodingError {
    return new HttpParserChunkedEncodingError(chunkData, 'Missing chunk terminator', context);
  }

  static invalidTrailer(chunkData: string, context?: Partial<HttpParserErrorContext>): HttpParserChunkedEncodingError {
    return new HttpParserChunkedEncodingError(chunkData, 'Invalid trailer', context);
  }
}

/**
 * Multipart Error
 *
 * Thrown when multipart form data parsing fails.
 */
export class HttpParserMultipartError extends HttpParserError {
  public readonly boundary: string;
  public readonly reason: string;

  constructor(boundary: string, reason: string, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_MULTIPART_ERROR',
      `Multipart parsing error (boundary: ${boundary}): ${reason}`,
      { ...context, operation: 'parse-multipart', metadata: { boundary, reason } },
      cause
    );
    this.name = 'HttpParserMultipartError';
    this.boundary = boundary;
    this.reason = reason;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserMultipartError);
    }
  }

  static missingBoundary(boundary: string, context?: Partial<HttpParserErrorContext>): HttpParserMultipartError {
    return new HttpParserMultipartError(boundary, 'Missing boundary', context);
  }

  static invalidPart(
    boundary: string,
    partIndex: number,
    reason: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserMultipartError {
    return new HttpParserMultipartError(boundary, `Part ${partIndex}: ${reason}`, context);
  }

  static missingEndBoundary(boundary: string, context?: Partial<HttpParserErrorContext>): HttpParserMultipartError {
    return new HttpParserMultipartError(boundary, 'Missing end boundary', context);
  }
}

/**
 * Incomplete Request Error
 *
 * Thrown when HTTP request is incomplete.
 */
export class HttpParserIncompleteRequestError extends HttpParserError {
  public readonly parserState: string;
  public readonly bytesReceived: number;
  public readonly expectedBytes?: number;

  constructor(
    parserState: string,
    bytesReceived: number,
    expectedBytes: number | undefined,
    context: Partial<HttpParserErrorContext> = {},
    cause?: Error
  ) {
    super(
      'HTTP_PARSER_INCOMPLETE_REQUEST',
      `Incomplete HTTP request: state=${parserState}, received=${bytesReceived} bytes${expectedBytes ? `, expected=${expectedBytes}` : ''}`,
      { ...context, operation: 'parse', metadata: { parserState, bytesReceived, expectedBytes } },
      cause
    );
    this.name = 'HttpParserIncompleteRequestError';
    this.parserState = parserState;
    this.bytesReceived = bytesReceived;
    this.expectedBytes = expectedBytes;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserIncompleteRequestError);
    }
  }
}

/**
 * Invalid Content Length Error
 *
 * Thrown when Content-Length header is invalid.
 */
export class HttpParserInvalidContentLengthError extends HttpParserError {
  public readonly contentLengthHeader: string;

  constructor(contentLengthHeader: string, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_INVALID_CONTENT_LENGTH',
      `Invalid Content-Length header: ${contentLengthHeader}`,
      { ...context, operation: 'validate-content-length', metadata: { contentLengthHeader } },
      cause
    );
    this.name = 'HttpParserInvalidContentLengthError';
    this.contentLengthHeader = contentLengthHeader;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserInvalidContentLengthError);
    }
  }

  static nonNumeric(
    contentLengthHeader: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidContentLengthError {
    return new HttpParserInvalidContentLengthError(contentLengthHeader, context);
  }

  static negative(
    contentLengthHeader: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidContentLengthError {
    return new HttpParserInvalidContentLengthError(contentLengthHeader, context);
  }

  static multipleValues(
    contentLengthHeader: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidContentLengthError {
    return new HttpParserInvalidContentLengthError(contentLengthHeader, context);
  }
}

/**
 * Invalid Transfer Encoding Error
 *
 * Thrown when Transfer-Encoding header is invalid.
 */
export class HttpParserInvalidTransferEncodingError extends HttpParserError {
  public readonly transferEncodingHeader: string;

  constructor(transferEncodingHeader: string, context: Partial<HttpParserErrorContext> = {}, cause?: Error) {
    super(
      'HTTP_PARSER_INVALID_TRANSFER_ENCODING',
      `Invalid Transfer-Encoding header: ${transferEncodingHeader}`,
      { ...context, operation: 'validate-transfer-encoding', metadata: { transferEncodingHeader } },
      cause
    );
    this.name = 'HttpParserInvalidTransferEncodingError';
    this.transferEncodingHeader = transferEncodingHeader;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpParserInvalidTransferEncodingError);
    }
  }

  static unsupportedEncoding(
    transferEncodingHeader: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidTransferEncodingError {
    return new HttpParserInvalidTransferEncodingError(transferEncodingHeader, context);
  }

  static chunkedWithContentLength(
    transferEncodingHeader: string,
    context?: Partial<HttpParserErrorContext>
  ): HttpParserInvalidTransferEncodingError {
    return new HttpParserInvalidTransferEncodingError(transferEncodingHeader, context);
  }
}

/**
 * Error Factory for creating HTTP parser errors
 */
export class HttpParserErrorFactory {
  static configuration(
    message: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserConfigurationError {
    return new HttpParserConfigurationError(message, context, cause);
  }

  static execution(
    message: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserExecutionError {
    return new HttpParserExecutionError(message, context, cause);
  }

  static timeout(
    operation: string,
    timeoutMs: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserTimeoutError {
    return new HttpParserTimeoutError(operation, timeoutMs, context, cause);
  }

  static validation(
    field: string,
    value: unknown,
    constraint: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserValidationError {
    return new HttpParserValidationError(field, value, constraint, context, cause);
  }

  static parseError(
    code: HttpParserErrorCode,
    message: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserParseError {
    return new HttpParserParseError(code, message, parserState, bytesProcessed, totalBytes, context, cause);
  }

  static invalidRequestLine(
    requestLine: string,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserInvalidRequestLineError {
    return new HttpParserInvalidRequestLineError(requestLine, parserState, bytesProcessed, totalBytes, context, cause);
  }

  static invalidHeaders(
    headerLines: string[],
    failedAtLine: number,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserInvalidHeadersError {
    return new HttpParserInvalidHeadersError(
      headerLines,
      failedAtLine,
      parserState,
      bytesProcessed,
      totalBytes,
      context,
      cause
    );
  }

  static invalidBody(
    actualLength: number,
    expectedLength: number | undefined,
    parserState: string,
    bytesProcessed: number,
    totalBytes: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserInvalidBodyError {
    return new HttpParserInvalidBodyError(
      actualLength,
      expectedLength,
      parserState,
      bytesProcessed,
      totalBytes,
      context,
      cause
    );
  }

  static unsupportedMethod(
    method: string,
    supportedMethods: string[],
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserUnsupportedMethodError {
    return new HttpParserUnsupportedMethodError(method, supportedMethods, context, cause);
  }

  static unsupportedVersion(
    version: string,
    supportedVersions: string[],
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserUnsupportedVersionError {
    return new HttpParserUnsupportedVersionError(version, supportedVersions, context, cause);
  }

  static headerTooLarge(
    headerSize: number,
    maxHeaderSize: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserHeaderTooLargeError {
    return new HttpParserHeaderTooLargeError(headerSize, maxHeaderSize, context, cause);
  }

  static bodyTooLarge(
    bodySize: number,
    maxBodySize: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserBodyTooLargeError {
    return new HttpParserBodyTooLargeError(bodySize, maxBodySize, context, cause);
  }

  static tooManyHeaders(
    headerCount: number,
    maxHeaders: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserTooManyHeadersError {
    return new HttpParserTooManyHeadersError(headerCount, maxHeaders, context, cause);
  }

  static urlTooLong(
    url: string,
    urlLength: number,
    maxUrlLength: number,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserUrlTooLongError {
    return new HttpParserUrlTooLongError(url, urlLength, maxUrlLength, context, cause);
  }

  static chunkedEncoding(
    chunkData: string,
    reason: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserChunkedEncodingError {
    return new HttpParserChunkedEncodingError(chunkData, reason, context, cause);
  }

  static multipart(
    boundary: string,
    reason: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserMultipartError {
    return new HttpParserMultipartError(boundary, reason, context, cause);
  }

  static incompleteRequest(
    parserState: string,
    bytesReceived: number,
    expectedBytes: number | undefined,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserIncompleteRequestError {
    return new HttpParserIncompleteRequestError(parserState, bytesReceived, expectedBytes, context, cause);
  }

  static invalidContentLength(
    contentLengthHeader: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserInvalidContentLengthError {
    return new HttpParserInvalidContentLengthError(contentLengthHeader, context, cause);
  }

  static invalidTransferEncoding(
    transferEncodingHeader: string,
    context?: Partial<HttpParserErrorContext>,
    cause?: Error
  ): HttpParserInvalidTransferEncodingError {
    return new HttpParserInvalidTransferEncodingError(transferEncodingHeader, context, cause);
  }
}
