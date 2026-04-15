# Validation and Error Handling

## Validation Strategy

The HTTP Parser Layer implements comprehensive validation to ensure RFC compliance and security. Validation occurs at multiple stages of the parsing process.

## Request Line Validation

### Method Validation
```typescript
enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
  CONNECT = 'CONNECT'
}

function validateMethod(method: string): HttpMethod {
  const upperMethod = method.toUpperCase();
  if (!Object.values(HttpMethod).includes(upperMethod as HttpMethod)) {
    throw ParseError.INVALID_METHOD;
  }
  return upperMethod as HttpMethod;
}
```

### URI Validation
```typescript
function validateURI(uri: string): void {
  // URI must not be empty
  if (!uri || uri.length === 0) {
    throw ParseError.INVALID_URI;
  }
  
  // URI must start with '/' for absolute path
  if (!uri.startsWith('/')) {
    throw ParseError.INVALID_URI;
  }
  
  // Check for invalid characters
  if (/[\x00-\x1F\x7F]/.test(uri)) {
    throw ParseError.INVALID_URI;
  }
}
```

### HTTP Version Validation
```typescript
enum HttpVersion {
  HTTP_1_0 = 'HTTP/1.0',
  HTTP_1_1 = 'HTTP/1.1',
  HTTP_2_0 = 'HTTP/2.0'
}

function validateVersion(version: string): HttpVersion {
  if (!Object.values(HttpVersion).includes(version as HttpVersion)) {
    throw ParseError.INVALID_VERSION;
  }
  return version as HttpVersion;
}
```

## Header Validation

### Header Name Validation
```typescript
function validateHeaderName(name: string): void {
  // Header names must be case-insensitive
  // Valid characters: letters, digits, hyphen
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    throw ParseError.INVALID_HEADER_NAME;
  }
  
  // Header name must not exceed limit
  if (name.length > this.config.maxHeaderNameLength) {
    throw ParseError.HEADER_NAME_TOO_LONG;
  }
}
```

### Header Value Validation
```typescript
function validateHeaderValue(value: string): void {
  // Header value must not exceed limit
  if (value.length > this.config.maxHeaderValueLength) {
    throw ParseError.HEADER_VALUE_TOO_LONG;
  }
  
  // Check for control characters (except SP and HTAB)
  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(value)) {
    throw ParseError.INVALID_HEADER_VALUE;
  }
}
```

### Content-Length Validation
```typescript
function validateContentLength(value: string): number {
  const length = parseInt(value, 10);
  
  if (isNaN(length)) {
    throw ParseError.INVALID_CONTENT_LENGTH;
  }
  
  if (length < 0) {
    throw ParseError.INVALID_CONTENT_LENGTH;
  }
  
  if (length > this.config.maxBodySize) {
    throw ParseError.BODY_TOO_LARGE;
  }
  
  return length;
}
```

### Content-Type Validation
```typescript
function validateContentType(contentType: string): MimeType {
  const mimeType = parseMimeType(contentType);
  
  // Validate type and subtype
  if (!mimeType.type || !mimeType.subtype) {
    throw ParseError.INVALID_CONTENT_TYPE;
  }
  
  // Validate charset if present
  if (mimeType.charset) {
    const validCharsets = ['utf-8', 'utf-16', 'iso-8859-1', 'ascii'];
    if (!validCharsets.includes(mimeType.charset.toLowerCase())) {
      throw ParseError.INVALID_CHARSET;
    }
  }
  
  return mimeType;
}
```

## Body Validation

### Body Size Validation
```typescript
function validateBodySize(size: number): void {
  if (size > this.config.maxBodySize) {
    throw ParseError.BODY_TOO_LARGE;
  }
  
  if (size < 0) {
    throw ParseError.INVALID_BODY_SIZE;
  }
}
```

### Body Content Validation
```typescript
function validateBodyContent(body: Buffer, contentType: MimeType): void {
  // Validate based on content type
  switch (contentType.subtype) {
    case 'json':
      try {
        JSON.parse(body.toString());
      } catch (error) {
        throw ParseError.INVALID_JSON;
      }
      break;
      
    case 'xml':
      // XML validation
      break;
      
    case 'urlencoded':
      // URL-encoded validation
      break;
  }
}
```

## Error Handling

### Error Types
```typescript
enum ParseError {
  // Request line errors
  INVALID_METHOD,
  INVALID_URI,
  INVALID_VERSION,
  MALFORMED_REQUEST_LINE,
  
  // Header errors
  INVALID_HEADER_NAME,
  INVALID_HEADER_VALUE,
  HEADER_NAME_TOO_LONG,
  HEADER_VALUE_TOO_LONG,
  DUPLICATE_HEADER,
  
  // Body errors
  INVALID_CONTENT_LENGTH,
  BODY_TOO_LARGE,
  INVALID_BODY_SIZE,
  INVALID_CONTENT_TYPE,
  INVALID_CHARSET,
  INVALID_JSON,
  INVALID_XML,
  
  // Chunked encoding errors
  INVALID_CHUNK_SIZE,
  INVALID_CHUNK_EXTENSION,
  CHUNK_TOO_LARGE,
  
  // General errors
  INCOMPLETE_REQUEST,
  TIMEOUT,
  INTERNAL_ERROR
}
```

### Error Context
```typescript
interface ParseErrorContext {
  error: ParseError;
  position: number;
  line: number;
  column: number;
  details?: string;
  raw?: string;
}
```

### Error Reporting
```typescript
class ParseErrorReporter {
  private errors: ParseErrorContext[] = [];
  private warnings: ParseWarning[] = [];
  
  reportError(error: ParseError, context: Partial<ParseErrorContext>): void {
    this.errors.push({
      error,
      position: context.position || 0,
      line: context.line || 0,
      column: context.column || 0,
      details: context.details,
      raw: context.raw
    });
  }
  
  reportWarning(warning: ParseWarning): void {
    this.warnings.push(warning);
  }
  
  getErrors(): ParseErrorContext[] {
    return this.errors;
  }
  
  getWarnings(): ParseWarning[] {
    return this.warnings;
  }
  
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
```

### Error Recovery
```typescript
enum ParseMode {
  STRICT,  // Fail on any error
  LENIENT, // Continue on non-critical errors
  PERMISSIVE // Continue on all errors
}

function handleParseError(error: ParseError, mode: ParseMode): boolean {
  switch (mode) {
    case ParseMode.STRICT:
      throw error;
      
    case ParseMode.LENIENT:
      // Continue on non-critical errors
      if (isCriticalError(error)) {
        throw error;
      }
      return false;
      
    case ParseMode.PERMISSIVE:
      // Continue on all errors
      return false;
  }
}

function isCriticalError(error: ParseError): boolean {
  const criticalErrors = [
    ParseError.BODY_TOO_LARGE,
    ParseError.INVALID_CONTENT_LENGTH,
    ParseError.MALFORMED_REQUEST_LINE
  ];
  return criticalErrors.includes(error);
}
```

## Warnings

### Warning Types
```typescript
enum ParseWarning {
  OBSOLETE_HEADER,
  DEPRECATED_FEATURE,
  NON_STANDARD_HEADER,
  MISSING_RECOMMENDED_HEADER,
  DUPLICATE_HEADER,
  MALFORMED_BUT_RECOVERABLE
}
```

### Warning Reporting
```typescript
interface ParseWarning {
  type: ParseWarning;
  message: string;
  position: number;
  severity: 'info' | 'warning';
}
```

## Statistics and Monitoring

### Error Statistics
```typescript
interface ParseStatistics {
  totalRequests: number;
  successfulParses: number;
  failedParses: number;
  errorCounts: Map<ParseError, number>;
  warningCounts: Map<ParseWarning, number>;
  averageParseTime: number;
  maxParseTime: number;
  minParseTime: number;
}
```

### Error Tracking
```typescript
class ParseStatisticsTracker {
  private stats: ParseStatistics;
  
  recordParse(success: boolean, duration: number): void {
    this.stats.totalRequests++;
    
    if (success) {
      this.stats.successfulParses++;
    } else {
      this.stats.failedParses++;
    }
    
    this.updateParseTimeStats(duration);
  }
  
  recordError(error: ParseError): void {
    const count = this.stats.errorCounts.get(error) || 0;
    this.stats.errorCounts.set(error, count + 1);
  }
  
  recordWarning(warning: ParseWarning): void {
    const count = this.stats.warningCounts.get(warning) || 0;
    this.stats.warningCounts.set(warning, count + 1);
  }
  
  getStatistics(): ParseStatistics {
    return { ...this.stats };
  }
  
  resetStatistics(): void {
    this.stats = {
      totalRequests: 0,
      successfulParses: 0,
      failedParses: 0,
      errorCounts: new Map(),
      warningCounts: new Map(),
      averageParseTime: 0,
      maxParseTime: 0,
      minParseTime: Infinity
    };
  }
}
```

## Configuration

### Validation Configuration
```typescript
interface ValidationConfig {
  strictMode: boolean;
  maxHeaderNameLength: number;
  maxHeaderValueLength: number;
  maxHeadersCount: number;
  maxBodySize: number;
  maxUriLength: number;
  allowedMethods: HttpMethod[];
  allowedVersions: HttpVersion[];
  validateContentType: boolean;
  validateBodyContent: boolean;
}
```

### Default Configuration
```typescript
const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  strictMode: true,
  maxHeaderNameLength: 128,
  maxHeaderValueLength: 8192,
  maxHeadersCount: 100,
  maxBodySize: 10 * 1024 * 1024, // 10MB
  maxUriLength: 8192,
  allowedMethods: Object.values(HttpMethod),
  allowedVersions: [HttpVersion.HTTP_1_1, HttpVersion.HTTP_2_0],
  validateContentType: true,
  validateBodyContent: false
};
```

## Security Considerations

### Input Sanitization
- Sanitize all parsed data
- Remove null bytes
- Escape special characters
- Validate character encodings

### Attack Prevention
- Enforce size limits strictly
- Detect and prevent buffer overflow
- Handle malformed input gracefully
- Prevent denial of service attacks

### Logging
- Log all parse errors
- Log suspicious patterns
- Track error rates
- Alert on high error rates

## Best Practices

### Validation Guidelines
- Validate early, validate often
- Fail fast on critical errors
- Provide detailed error messages
- Maintain error context
- Log errors for debugging

### Error Handling Guidelines
- Use typed errors
- Provide error context
- Implement error recovery
- Track error statistics
- Monitor error rates
