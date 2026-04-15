/**
 * HTTP Request Parser Implementation
 * 
 * Concrete implementation of IHttpRequestParser.
 * Parses raw HTTP request data into structured HttpRequest objects.
 */

import { IHttpRequestParser } from '../interfaces/IHttpRequestParser';
import {
  HttpRequest,
  ParseResult,
  ParserConfig,
  HttpMethod,
  HttpVersion,
  HttpRequestLine,
  ParseErrorCode,
  ExtendedParserConfig,
  ExtendedParseResult,
  ExtendedHttpRequest,
  QueryString,
  QueryParameter,
  ParsedCookies,
  Cookie,
  MimeType,
  ContentDisposition,
  ChunkInfo,
  MultipartFormData,
  MultipartPart,
  ParsingStats,
  ValidationRules,
  ParserState,
  ParseWarning,
  ParserHealthStatus,
  ParserDiagnostics,
  DiagnosticStep,
  DiagnosticSummary,
  HealthCheck,
  SecurityHeadersConfig,
  CorsConfig,
  RateLimitConfig,
  HttpResponse,
  ExtendedHttpResponse,
  HttpStatusLine,
} from '../types/http-parser-types';
import { v4 as uuidv4 } from 'uuid';

export class HttpRequestParser implements IHttpRequestParser {
  private _defaultConfig: ParserConfig;
  private _extendedDefaultConfig: ExtendedParserConfig;
  private _state: ParserState;
  private _stats: ParsingStats;
  private _warnings: ParseWarning[];
  private _validationRules: ValidationRules;
  private _securityHeadersConfig: SecurityHeadersConfig;
  private _corsConfig: CorsConfig;
  private _rateLimitConfig: RateLimitConfig;
  private _parseStartTime: number;

  constructor() {
    this._defaultConfig = {
      maxHeaderSize: 8192,
      maxBodySize: 10485760,
      strictMode: true,
      allowChunkedEncoding: true,
      maxHeaderCount: 100,
      maxUrlLength: 2048,
      allowHttp2: false,
      enableValidation: true,
      timeout: 30000,
      keepAlive: true,
      maxConnections: 100,
    };

    this._extendedDefaultConfig = {
      ...this._defaultConfig,
      enableCompression: false,
      enableDecompression: false,
      allowedContentTypes: [],
      allowedMethods: [],
      allowedOrigins: [],
      corsEnabled: false,
      rateLimitEnabled: false,
      rateLimitMax: 100,
      rateLimitWindow: 60000,
      securityHeadersEnabled: false,
      customHeaders: new Map(),
    };

    this._state = ParserState.IDLE;
    this._stats = {
      totalRequestsParsed: 0,
      totalBytesParsed: 0,
      totalHeadersParsed: 0,
      totalBodiesParsed: 0,
      averageParseTime: 0,
      errorCount: 0,
      lastParseTime: 0,
      parseErrors: new Map(),
    };

    this._warnings = [];

    this._validationRules = {
      requiredHeaders: [],
      forbiddenHeaders: [],
      maxHeaderNameLength: 128,
      maxHeaderValueLength: 8192,
      allowEmptyBody: true,
      validateContentType: false,
      validateContentLength: false,
      validateHost: false,
      validateUserAgent: false,
    };

    this._securityHeadersConfig = {
      enableXFrameOptions: false,
      enableXContentTypeOptions: false,
      enableXSSProtection: false,
      enableStrictTransportSecurity: false,
      enableContentSecurityPolicy: false,
      enableReferrerPolicy: false,
      customSecurityHeaders: new Map(),
    };

    this._corsConfig = {
      enabled: false,
      allowedOrigins: [],
      allowedMethods: [],
      allowedHeaders: [],
      exposedHeaders: [],
      allowCredentials: false,
      maxAge: 86400,
    };

    this._rateLimitConfig = {
      enabled: false,
      maxRequests: 100,
      windowMs: 60000,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    };

    this._parseStartTime = 0;
  }

  parse(raw: Buffer, config?: ParserConfig): ParseResult<HttpRequest> {
    const parserConfig = config || this._defaultConfig;

    try {
      const rawString = raw.toString('utf-8');
      const lines = rawString.split('\r\n');

      if (lines.length < 1) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.MALFORMED_REQUEST,
            message: 'Empty request',
          },
        };
      }

      const requestLineResult = this.parseRequestLine(lines[0]);
      if (!requestLineResult.success || !requestLineResult.data) {
        return {
          success: false,
          error: requestLineResult.error,
        };
      }

      const emptyLineIndex = lines.indexOf('');
      if (emptyLineIndex === -1) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.MALFORMED_REQUEST,
            message: 'Missing empty line between headers and body',
          },
        };
      }

      const headerLines = lines.slice(1, emptyLineIndex);
      const headersResult = this.parseHeaders(headerLines);
      if (!headersResult.success || !headersResult.data) {
        return {
          success: false,
          error: headersResult.error,
        };
      }

      const bodyStart = emptyLineIndex + 1;
      const bodyLines = lines.slice(bodyStart);
      const body = Buffer.from(bodyLines.join('\r\n'), 'utf-8');

      if (body.length > parserConfig.maxBodySize) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.INVALID_BODY,
            message: `Body size exceeds maximum of ${parserConfig.maxBodySize}`,
          },
        };
      }

      const requestLine: HttpRequestLine = {
        method: requestLineResult.data.method as HttpMethod,
        path: requestLineResult.data.path,
        version: requestLineResult.data.version as HttpVersion,
      };

      const request: HttpRequest = {
        line: requestLine,
        headers: headersResult.data,
        body,
        raw,
      };

      if (parserConfig.strictMode && !this.validate(request)) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.MALFORMED_REQUEST,
            message: 'Request validation failed in strict mode',
          },
        };
      }

      return {
        success: true,
        data: request,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.MALFORMED_REQUEST,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  parseRequestLine(line: string): ParseResult<{
    method: string;
    path: string;
    version: string;
  }> {
    const parts = line.split(' ');

    if (parts.length !== 3) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.MALFORMED_REQUEST,
          message: `Invalid request line format: ${line}`,
        },
      };
    }

    const [method, path, version] = parts;

    if (!Object.values(HttpMethod).includes(method as HttpMethod)) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.INVALID_METHOD,
          message: `Invalid HTTP method: ${method}`,
        },
      };
    }

    if (!Object.values(HttpVersion).includes(version as HttpVersion)) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.INVALID_VERSION,
          message: `Invalid HTTP version: ${version}`,
        },
      };
    }

    return {
      success: true,
      data: { method, path, version },
    };
  }

  parseHeaders(headerLines: string[]): ParseResult<Map<string, string>> {
    const headers = new Map<string, string>();

    for (const line of headerLines) {
      if (!line.trim()) {
        continue;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.INVALID_HEADER,
            message: `Invalid header format: ${line}`,
          },
        };
      }

      const name = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();

      if (!name) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.INVALID_HEADER,
            message: 'Header name cannot be empty',
          },
        };
      }

      headers.set(name.toLowerCase(), value);
    }

    return {
      success: true,
      data: headers,
    };
  }

  validate(request: HttpRequest): boolean {
    if (!request.line?.method || !request.line?.path || !request.line?.version) {
      return false;
    }

    if (!Object.values(HttpMethod).includes(request.line.method)) {
      return false;
    }

    if (!Object.values(HttpVersion).includes(request.line.version)) {
      return false;
    }

    if (!request.headers) {
      return false;
    }

    return true;
  }

  setDefaultConfig(config: ParserConfig): void {
    this._defaultConfig = { ...this._defaultConfig, ...config };
  }

  getDefaultConfig(): ParserConfig {
    return { ...this._defaultConfig };
  }

  parseExtended(raw: Buffer, config?: ExtendedParserConfig): ExtendedParseResult<ExtendedHttpRequest> {
    this._parseStartTime = Date.now();
    this._state = ParserState.PARSING_REQUEST_LINE;
    this._warnings = [];

    const parserConfig = config || this._extendedDefaultConfig;
    const baseResult = this.parse(raw, parserConfig);

    if (!baseResult.success || !baseResult.data) {
      this._state = ParserState.ERROR;
      this._stats.errorCount++;
      const errorCode = baseResult.error?.code || ParseErrorCode.MALFORMED_REQUEST;
      const currentCount = this._stats.parseErrors.get(errorCode) || 0;
      this._stats.parseErrors.set(errorCode, currentCount + 1);
      return {
        success: false,
        error: baseResult.error,
        warnings: this._warnings,
        metrics: this._calculateMetrics(),
        stats: this._stats,
      };
    }

    this._state = ParserState.PARSING_HEADERS;
    const extendedRequest: ExtendedHttpRequest = {
      ...baseResult.data,
    };

    if (extendedRequest.line.path.includes('?')) {
      const queryString = extendedRequest.line.path.split('?')[1] || '';
      extendedRequest.query = this.parseQueryString(queryString);
    }

    const cookieHeader = extendedRequest.headers.get('cookie');
    if (cookieHeader) {
      extendedRequest.cookies = this.parseCookies(cookieHeader);
    }

    const contentType = extendedRequest.headers.get('content-type');
    if (contentType) {
      const mimeType = this.parseMimeType(contentType);
      if (mimeType) {
        extendedRequest.mimeType = mimeType;
      }
    }

    const contentDisposition = extendedRequest.headers.get('content-disposition');
    if (contentDisposition) {
      const disposition = this.parseContentDisposition(contentDisposition);
      if (disposition) {
        extendedRequest.contentDisposition = disposition;
      }
    }

    this._state = ParserState.PARSING_BODY;
    const transferEncoding = extendedRequest.headers.get('transfer-encoding');
    if (transferEncoding === 'chunked' && parserConfig.allowChunkedEncoding) {
      extendedRequest.chunks = this.parseChunkedEncoding(extendedRequest.body);
    }

    if (contentType?.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1];
      if (boundary) {
        extendedRequest.multipart = this.parseMultipartFormData(extendedRequest.body, boundary);
      }
    }

    this._state = ParserState.COMPLETE;
    this._stats.totalRequestsParsed++;
    this._stats.totalBytesParsed += raw.length;
    this._stats.totalHeadersParsed += extendedRequest.headers.size;
    this._stats.totalBodiesParsed += extendedRequest.body.length;
    this._stats.lastParseTime = Date.now() - this._parseStartTime;
    this._stats.averageParseTime = this._stats.totalRequestsParsed > 0
      ? (this._stats.averageParseTime * (this._stats.totalRequestsParsed - 1) + this._stats.lastParseTime) / this._stats.totalRequestsParsed
      : 0;

    return {
      success: true,
      data: extendedRequest,
      warnings: this._warnings,
      metrics: this._calculateMetrics(),
      stats: this._stats,
    };
  }

  parseQueryString(queryString: string): QueryString {
    const parameters: QueryParameter[] = [];

    if (!queryString) {
      return { parameters, raw: '' };
    }

    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [name, value] = pair.split('=');
      parameters.push({ name: name || '', value: decodeURIComponent(value || '') });
    }

    return { parameters, raw: queryString };
  }

  parseCookies(cookieHeader: string): ParsedCookies {
    const cookies = new Map<string, Cookie>();

    if (!cookieHeader) {
      return { cookies, raw: '' };
    }

    const cookieStrings = cookieHeader.split(';');
    for (const cookieString of cookieStrings) {
      const [name, value] = cookieString.trim().split('=');
      if (name && value) {
        cookies.set(name, { name, value });
      }
    }

    return { cookies, raw: cookieHeader };
  }

  parseMimeType(contentType: string): MimeType | null {
    if (!contentType) {
      return null;
    }

    const parts = contentType.split(';');
    const [type, subtype] = parts[0].split('/');

    const mimeType: MimeType = {
      type: type || '',
      subtype: subtype || '',
    };

    for (let i = 1; i < parts.length; i++) {
      const [key, value] = parts[i].trim().split('=');
      if (key === 'charset' && value) {
        mimeType.charset = value;
      } else if (key === 'boundary' && value) {
        mimeType.boundary = value;
      }
    }

    return mimeType;
  }

  parseContentDisposition(contentDisposition: string): ContentDisposition | null {
    if (!contentDisposition) {
      return null;
    }

    const parts = contentDisposition.split(';');
    const type = parts[0].trim() as 'inline' | 'attachment' | 'form-data';

    const disposition: ContentDisposition = {
      type,
      parameters: new Map(),
    };

    for (let i = 1; i < parts.length; i++) {
      const [key, value] = parts[i].trim().split('=');
      const cleanValue = value ? value.replace(/"/g, '') : '';

      if (key === 'filename') {
        disposition.filename = cleanValue;
      } else if (key === 'name') {
        disposition.name = cleanValue;
      } else {
        disposition.parameters.set(key, cleanValue);
      }
    }

    return disposition;
  }

  parseChunkedEncoding(body: Buffer): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];
    const bodyStr = body.toString('utf-8');
    const lines = bodyStr.split('\r\n');

    let i = 0;
    while (i < lines.length) {
      const sizeLine = lines[i];
      const size = parseInt(sizeLine, 16);

      if (isNaN(size) || size === 0) {
        break;
      }

      i++;
      const data = Buffer.from(lines[i] || '', 'utf-8');

      chunks.push({
        size,
        extensions: new Map(),
        data,
      });

      i += 2;
    }

    return chunks;
  }

  parseMultipartFormData(body: Buffer, boundary: string): MultipartFormData {
    const parts: MultipartPart[] = [];
    const bodyStr = body.toString('utf-8');
    const boundaryStr = `--${boundary}`;
    const sections = bodyStr.split(boundaryStr);

    for (const section of sections) {
      if (!section.trim() || section === '--\r\n') {
        continue;
      }

      const sectionLines = section.split('\r\n');
      const headersEndIndex = sectionLines.indexOf('');
      const headerLines = sectionLines.slice(0, headersEndIndex);
      const bodyLines = sectionLines.slice(headersEndIndex + 1, -1);

      const headers = new Map<string, string>();
      for (const line of headerLines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const name = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          headers.set(name.toLowerCase(), value);
        }
      }

      const part: MultipartPart = {
        headers,
        body: Buffer.from(bodyLines.join('\r\n'), 'utf-8'),
      };

      const contentDisposition = headers.get('content-disposition');
      if (contentDisposition) {
        const disposition = this.parseContentDisposition(contentDisposition);
        if (disposition) {
          part.name = disposition.name;
          part.filename = disposition.filename;
        }
      }

      const contentType = headers.get('content-type');
      if (contentType) {
        part.contentType = contentType;
      }

      parts.push(part);
    }

    return { boundary, parts };
  }

  getStats(): ParsingStats {
    return { ...this._stats, parseErrors: new Map(this._stats.parseErrors) };
  }

  resetStats(): void {
    this._stats = {
      totalRequestsParsed: 0,
      totalBytesParsed: 0,
      totalHeadersParsed: 0,
      totalBodiesParsed: 0,
      averageParseTime: 0,
      errorCount: 0,
      lastParseTime: 0,
      parseErrors: new Map(),
    };
  }

  getState(): ParserState {
    return this._state;
  }

  setValidationRules(rules: ValidationRules): void {
    this._validationRules = { ...this._validationRules, ...rules };
  }

  getValidationRules(): ValidationRules {
    return { ...this._validationRules };
  }

  validateResponse(response: HttpResponse): boolean {
    if (!response.line?.version || !response.line?.statusCode) {
      return false;
    }

    if (!Object.values(HttpVersion).includes(response.line.version)) {
      return false;
    }

    if (response.line.statusCode < 100 || response.line.statusCode > 599) {
      return false;
    }

    if (!response.headers) {
      return false;
    }

    return true;
  }

  parseResponse(raw: Buffer, config?: ParserConfig): ParseResult<HttpResponse> {
    const parserConfig = config || this._defaultConfig;

    try {
      const rawString = raw.toString('utf-8');
      const lines = rawString.split('\r\n');

      if (lines.length < 1) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.MALFORMED_REQUEST,
            message: 'Empty response',
          },
        };
      }

      const statusLineResult = this.parseStatusLine(lines[0]);
      if (!statusLineResult.success || !statusLineResult.data) {
        return {
          success: false,
          error: statusLineResult.error,
        };
      }

      const emptyLineIndex = lines.indexOf('');
      if (emptyLineIndex === -1) {
        return {
          success: false,
          error: {
            code: ParseErrorCode.MALFORMED_REQUEST,
            message: 'Missing empty line between headers and body',
          },
        };
      }

      const headerLines = lines.slice(1, emptyLineIndex);
      const headersResult = this.parseHeaders(headerLines);
      if (!headersResult.success || !headersResult.data) {
        return {
          success: false,
          error: headersResult.error,
        };
      }

      const bodyStart = emptyLineIndex + 1;
      const bodyLines = lines.slice(bodyStart);
      const body = Buffer.from(bodyLines.join('\r\n'), 'utf-8');

      const response: HttpResponse = {
        line: statusLineResult.data,
        headers: headersResult.data,
        body,
      };

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.MALFORMED_REQUEST,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  private parseStatusLine(line: string): ParseResult<HttpStatusLine> {
    const parts = line.split(' ');

    if (parts.length < 2) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.MALFORMED_REQUEST,
          message: `Invalid status line format: ${line}`,
        },
      };
    }

    const [version, statusCode, ...reasonParts] = parts;
    const reasonPhrase = reasonParts.join(' ');

    if (!Object.values(HttpVersion).includes(version as HttpVersion)) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.INVALID_VERSION,
          message: `Invalid HTTP version: ${version}`,
        },
      };
    }

    const statusCodeNum = parseInt(statusCode, 10);
    if (isNaN(statusCodeNum) || statusCodeNum < 100 || statusCodeNum > 599) {
      return {
        success: false,
        error: {
          code: ParseErrorCode.MALFORMED_REQUEST,
          message: `Invalid status code: ${statusCode}`,
        },
      };
    }

    return {
      success: true,
      data: {
        version: version as HttpVersion,
        statusCode: statusCodeNum,
        reasonPhrase,
      },
    };
  }

  parseResponseExtended(raw: Buffer, config?: ExtendedParserConfig): ExtendedParseResult<ExtendedHttpResponse> {
    this._parseStartTime = Date.now();
    this._state = ParserState.PARSING_REQUEST_LINE;
    this._warnings = [];

    const parserConfig = config || this._extendedDefaultConfig;
    const baseResult = this.parseResponse(raw, parserConfig);

    if (!baseResult.success || !baseResult.data) {
      this._state = ParserState.ERROR;
      this._stats.errorCount++;
      const errorCode = baseResult.error?.code || ParseErrorCode.MALFORMED_REQUEST;
      const currentCount = this._stats.parseErrors.get(errorCode) || 0;
      this._stats.parseErrors.set(errorCode, currentCount + 1);
      return {
        success: false,
        error: baseResult.error,
        warnings: this._warnings,
        metrics: this._calculateMetrics(),
        stats: this._stats,
      };
    }

    this._state = ParserState.COMPLETE;
    const extendedResponse: ExtendedHttpResponse = {
      ...baseResult.data,
    };

    const contentType = extendedResponse.headers.get('content-type');
    if (contentType) {
      const mimeType = this.parseMimeType(contentType);
      if (mimeType) {
        extendedResponse.mimeType = mimeType;
      }
    }

    const transferEncoding = extendedResponse.headers.get('transfer-encoding');
    if (transferEncoding === 'chunked' && parserConfig.allowChunkedEncoding) {
      extendedResponse.chunks = this.parseChunkedEncoding(extendedResponse.body);
    }

    return {
      success: true,
      data: extendedResponse,
      warnings: this._warnings,
      metrics: this._calculateMetrics(),
      stats: this._stats,
    };
  }

  getHealthStatus(): ParserHealthStatus {
    const checks: HealthCheck[] = [];

    const stateCheck = this._performStateHealthCheck();
    checks.push(stateCheck);

    const errorCheck = this._performErrorHealthCheck();
    checks.push(errorCheck);

    const performanceCheck = this._performPerformanceHealthCheck();
    checks.push(performanceCheck);

    const score = this._calculateHealthScore(checks);
    const status = this._determineHealthStatus(score);

    return {
      status,
      score,
      checks,
      lastCheck: new Date(),
    };
  }

  runDiagnostics(): ParserDiagnostics {
    const traceId = uuidv4();
    const startTime = new Date();
    const steps: DiagnosticStep[] = [];

    const stateCheck = this._performStateDiagnostics();
    steps.push(stateCheck);

    const configCheck = this._performConfigDiagnostics();
    steps.push(configCheck);

    const validationCheck = this._performValidationDiagnostics();
    steps.push(validationCheck);

    const endTime = new Date();
    const summary = this._calculateDiagnosticSummary(steps);

    return {
      traceId,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      steps,
      summary,
    };
  }

  setSecurityHeadersConfig(config: SecurityHeadersConfig): void {
    this._securityHeadersConfig = { ...this._securityHeadersConfig, ...config };
  }

  getSecurityHeadersConfig(): SecurityHeadersConfig {
    return { ...this._securityHeadersConfig, customSecurityHeaders: new Map(this._securityHeadersConfig.customSecurityHeaders) };
  }

  setCorsConfig(config: CorsConfig): void {
    this._corsConfig = { ...this._corsConfig, ...config };
  }

  getCorsConfig(): CorsConfig {
    return { ...this._corsConfig };
  }

  setRateLimitConfig(config: RateLimitConfig): void {
    this._rateLimitConfig = { ...this._rateLimitConfig, ...config };
  }

  getRateLimitConfig(): RateLimitConfig {
    return { ...this._rateLimitConfig };
  }

  isMethodAllowed(method: HttpMethod): boolean {
    const allowedMethods = this._extendedDefaultConfig.allowedMethods;
    if (allowedMethods.length === 0) {
      return true;
    }
    return allowedMethods.includes(method);
  }

  isContentTypeAllowed(contentType: string): boolean {
    const allowedTypes = this._extendedDefaultConfig.allowedContentTypes;
    if (allowedTypes.length === 0) {
      return true;
    }
    return allowedTypes.some((type) => contentType.includes(type));
  }

  isOriginAllowed(origin: string): boolean {
    const allowedOrigins = this._extendedDefaultConfig.allowedOrigins;
    if (allowedOrigins.length === 0) {
      return true;
    }
    return allowedOrigins.includes(origin);
  }

  addWarning(warning: ParseWarning): void {
    this._warnings.push(warning);
  }

  clearWarnings(): void {
    this._warnings = [];
  }

  getWarnings(): ParseWarning[] {
    return [...this._warnings];
  }

  resetState(): void {
    this._state = ParserState.IDLE;
  }

  getExtendedDefaultConfig(): ExtendedParserConfig {
    return { ...this._extendedDefaultConfig, customHeaders: new Map(this._extendedDefaultConfig.customHeaders) };
  }

  setExtendedDefaultConfig(config: ExtendedParserConfig): void {
    this._extendedDefaultConfig = { ...this._extendedDefaultConfig, ...config, customHeaders: new Map(config.customHeaders) };
  }

  private _calculateMetrics() {
    const now = Date.now();
    return {
      parseStartTime: this._parseStartTime,
      parseEndTime: now,
      parseDuration: now - this._parseStartTime,
      headerParseTime: (now - this._parseStartTime) * 0.3,
      bodyParseTime: (now - this._parseStartTime) * 0.5,
      validationTime: (now - this._parseStartTime) * 0.2,
      memoryUsage: 0,
    };
  }

  private _performStateHealthCheck(): HealthCheck {
    const isHealthy = this._state !== ParserState.ERROR;
    return {
      name: 'parser_state',
      status: isHealthy ? 'pass' : 'fail',
      message: `Parser state: ${this._state}`,
      duration: 0,
    };
  }

  private _performErrorHealthCheck(): HealthCheck {
    const isHealthy = this._stats.errorCount < 10;
    return {
      name: 'error_rate',
      status: isHealthy ? 'pass' : this._stats.errorCount < 50 ? 'warn' : 'fail',
      message: `Error count: ${this._stats.errorCount}`,
      duration: 0,
    };
  }

  private _performPerformanceHealthCheck(): HealthCheck {
    const isHealthy = this._stats.averageParseTime < 100;
    return {
      name: 'performance',
      status: isHealthy ? 'pass' : 'warn',
      message: `Average parse time: ${this._stats.averageParseTime}ms`,
      duration: 0,
    };
  }

  private _calculateHealthScore(checks: HealthCheck[]): number {
    let score = 100;
    checks.forEach((check) => {
      if (check.status === 'fail') {
        score -= 33;
      } else if (check.status === 'warn') {
        score -= 11;
      }
    });
    return Math.max(0, score);
  }

  private _determineHealthStatus(score: number): 'healthy' | 'degraded' | 'unhealthy' {
    if (score >= 80) {
      return 'healthy';
    } else if (score >= 50) {
      return 'degraded';
    }
    return 'unhealthy';
  }

  private _performStateDiagnostics(): DiagnosticStep {
    const startTime = new Date();
    try {
      const state = this._state;
      const endTime = new Date();
      return {
        name: 'state_check',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        status: 'success',
        details: { state },
      };
    } catch (error) {
      const endTime = new Date();
      return {
        name: 'state_check',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        status: 'failure',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private _performConfigDiagnostics(): DiagnosticStep {
    const startTime = new Date();
    const config = this._extendedDefaultConfig;
    const endTime = new Date();
    return {
      name: 'config_check',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      status: 'success',
      details: { config },
    };
  }

  private _performValidationDiagnostics(): DiagnosticStep {
    const startTime = new Date();
    const rules = this._validationRules;
    const endTime = new Date();
    return {
      name: 'validation_check',
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      status: 'success',
      details: { rules },
    };
  }

  private _calculateDiagnosticSummary(steps: DiagnosticStep[]): DiagnosticSummary {
    const totalSteps = steps.length;
    const successfulSteps = steps.filter((s) => s.status === 'success').length;
    const failedSteps = steps.filter((s) => s.status === 'failure').length;
    const skippedSteps = steps.filter((s) => s.status === 'skipped').length;

    let overallStatus: 'success' | 'failure' | 'partial';
    if (failedSteps === 0) {
      overallStatus = 'success';
    } else if (successfulSteps > 0) {
      overallStatus = 'partial';
    } else {
      overallStatus = 'failure';
    }

    return {
      totalSteps,
      successfulSteps,
      failedSteps,
      skippedSteps,
      overallStatus,
    };
  }
}
