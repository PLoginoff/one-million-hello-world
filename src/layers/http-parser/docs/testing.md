# Testing Strategy

## Overview
The HTTP Parser Layer follows a comprehensive testing strategy to ensure RFC compliance, security, and performance. Tests are organized into unit tests, integration tests, and advanced feature tests with specific coverage targets.

## Test Coverage Targets

### Coverage Goals
- **Minimum Coverage**: 95%
- **Target Coverage**: 99%+
- **Branch Coverage**: 90%+
- **Function Coverage**: 100%

### Coverage by Component
- **IHttpRequestParser Interface**: 100% (type validation)
- **HttpRequestParser Implementation**: 99%+
- **Type Definitions**: 100%
- **Validation Logic**: 99%+
- **Error Handling**: 99%+
- **Advanced Features**: 95%+

## Unit Tests

### Test Organization
```
src/layers/http-parser/__tests__/
├── unit/
│   ├── request-line.test.ts
│   ├── header-parsing.test.ts
│   ├── body-parsing.test.ts
│   ├── query-string.test.ts
│   ├── cookie-parsing.test.ts
│   ├── mime-type.test.ts
│   ├── content-disposition.test.ts
│   ├── chunked-encoding.test.ts
│   ├── multipart.test.ts
│   ├── validation.test.ts
│   ├── error-handling.test.ts
│   ├── statistics.test.ts
│   └── configuration.test.ts
```

### Unit Test Categories

#### 1. Request Line Tests
```typescript
describe('Request Line Parsing', () => {
  it('should parse valid GET request', () => {
    const requestLine = 'GET / HTTP/1.1\r\n';
    const result = parser.parseRequestLine(requestLine);
    expect(result.method).toBe(HttpMethod.GET);
    expect(result.uri).toBe('/');
    expect(result.version).toBe(HttpVersion.HTTP_1_1);
  });

  it('should parse valid POST request with path', () => {
    const requestLine = 'POST /api/users HTTP/1.1\r\n';
    const result = parser.parseRequestLine(requestLine);
    expect(result.method).toBe(HttpMethod.POST);
    expect(result.uri).toBe('/api/users');
  });

  it('should reject invalid method', () => {
    const requestLine = 'INVALID / HTTP/1.1\r\n';
    expect(() => parser.parseRequestLine(requestLine)).toThrow(ParseError.INVALID_METHOD);
  });

  it('should reject invalid URI', () => {
    const requestLine = 'GET invalid\x00 HTTP/1.1\r\n';
    expect(() => parser.parseRequestLine(requestLine)).toThrow(ParseError.INVALID_URI);
  });

  it('should reject invalid HTTP version', () => {
    const requestLine = 'GET / HTTP/3.0\r\n';
    expect(() => parser.parseRequestLine(requestLine)).toThrow(ParseError.INVALID_VERSION);
  });
});
```

#### 2. Header Parsing Tests
```typescript
describe('Header Parsing', () => {
  it('should parse valid headers', () => {
    const headers = 'Content-Type: application/json\r\nContent-Length: 100\r\n';
    const result = parser.parseHeaders(headers);
    expect(result.get('content-type')).toBe('application/json');
    expect(result.get('content-length')).toBe('100');
  });

  it('should normalize header names to lowercase', () => {
    const headers = 'Content-Type: application/json\r\n';
    const result = parser.parseHeaders(headers);
    expect(result.has('content-type')).toBe(true);
    expect(result.has('Content-Type')).toBe(false);
  });

  it('should handle empty header values', () => {
    const headers = 'X-Custom-Header:\r\n';
    const result = parser.parseHeaders(headers);
    expect(result.get('x-custom-header')).toBe('');
  });

  it('should reject header names with invalid characters', () => {
    const headers = 'Invalid@Header: value\r\n';
    expect(() => parser.parseHeaders(headers)).toThrow(ParseError.INVALID_HEADER_NAME);
  });

  it('should reject header values exceeding limit', () => {
    const longValue = 'x'.repeat(10000);
    const headers = `X-Long-Header: ${longValue}\r\n`;
    expect(() => parser.parseHeaders(headers)).toThrow(ParseError.HEADER_VALUE_TOO_LONG);
  });
});
```

#### 3. Query String Tests
```typescript
describe('Query String Parsing', () => {
  it('should parse simple query string', () => {
    const queryString = 'name=value';
    const result = parser.parseQueryString(queryString);
    expect(result.name).toBe('value');
  });

  it('should parse multiple parameters', () => {
    const queryString = 'name=John&age=30&city=NYC';
    const result = parser.parseQueryString(queryString);
    expect(result.name).toBe('John');
    expect(result.age).toBe('30');
    expect(result.city).toBe('NYC');
  });

  it('should handle URL encoding', () => {
    const queryString = 'name=John%20Doe';
    const result = parser.parseQueryString(queryString);
    expect(result.name).toBe('John Doe');
  });

  it('should handle multiple values for same key', () => {
    const queryString = 'tags=tag1&tags=tag2&tags=tag3';
    const result = parser.parseQueryString(queryString);
    expect(result.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should handle empty values', () => {
    const queryString = 'name=&age=30';
    const result = parser.parseQueryString(queryString);
    expect(result.name).toBe('');
    expect(result.age).toBe('30');
  });
});
```

#### 4. Cookie Parsing Tests
```typescript
describe('Cookie Parsing', () => {
  it('should parse simple cookie', () => {
    const cookieHeader = 'session=abc123';
    const result = parser.parseCookieHeader(cookieHeader);
    expect(result[0].name).toBe('session');
    expect(result[0].value).toBe('abc123');
  });

  it('should parse multiple cookies', () => {
    const cookieHeader = 'session=abc123; user=john; theme=dark';
    const result = parser.parseCookieHeader(cookieHeader);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('session');
    expect(result[1].name).toBe('user');
    expect(result[2].name).toBe('theme');
  });

  it('should handle cookie attributes', () => {
    const cookieHeader = 'session=abc123; Path=/; Secure; HttpOnly';
    const result = parser.parseCookieHeader(cookieHeader);
    expect(result[0].name).toBe('session');
    expect(result[0].value).toBe('abc123');
  });
});
```

#### 5. MIME Type Tests
```typescript
describe('MIME Type Parsing', () => {
  it('should parse simple MIME type', () => {
    const mimeType = 'application/json';
    const result = parser.parseMimeType(mimeType);
    expect(result.type).toBe('application');
    expect(result.subtype).toBe('json');
  });

  it('should parse MIME type with charset', () => {
    const mimeType = 'text/html; charset=utf-8';
    const result = parser.parseMimeType(mimeType);
    expect(result.type).toBe('text');
    expect(result.subtype).toBe('html');
    expect(result.charset).toBe('utf-8');
  });

  it('should parse MIME type with boundary', () => {
    const mimeType = 'multipart/form-data; boundary=----WebKitFormBoundary';
    const result = parser.parseMimeType(mimeType);
    expect(result.type).toBe('multipart');
    expect(result.subtype).toBe('form-data');
    expect(result.boundary).toBe('----WebKitFormBoundary');
  });

  it('should reject invalid charset', () => {
    const mimeType = 'text/html; charset=invalid';
    expect(() => parser.parseMimeType(mimeType)).toThrow(ParseError.INVALID_CHARSET);
  });
});
```

#### 6. Chunked Encoding Tests
```typescript
describe('Chunked Encoding', () => {
  it('should parse single chunk', async () => {
    const chunkData = '5\r\nhello\r\n0\r\n\r\n';
    const result = await parser.parseChunkedBody(chunkData);
    expect(result.toString()).toBe('hello');
  });

  it('should parse multiple chunks', async () => {
    const chunkData = '5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n';
    const result = await parser.parseChunkedBody(chunkData);
    expect(result.toString()).toBe('helloworld');
  });

  it('should parse chunk extensions', async () => {
    const chunkData = '5;name=value\r\nhello\r\n0\r\n\r\n';
    const result = await parser.parseChunkedBody(chunkData);
    expect(result.toString()).toBe('hello');
  });

  it('should reject invalid chunk size', async () => {
    const chunkData = 'invalid\r\nhello\r\n0\r\n\r\n';
    await expect(parser.parseChunkedBody(chunkData)).rejects.toThrow(ParseError.INVALID_CHUNK_SIZE);
  });
});
```

#### 7. Multipart Tests
```typescript
describe('Multipart Form Data', () => {
  it('should parse simple multipart form', async () => {
    const boundary = '----boundary';
    const multipartData = `------boundary\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n------boundary--\r\n`;
    const result = await parser.parseMultipartFormData(multipartData, boundary);
    expect(result).toHaveLength(1);
    expect(result[0].contentDisposition.name).toBe('field1');
  });

  it('should parse file upload', async () => {
    const boundary = '----boundary';
    const multipartData = `------boundary\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nfile content\r\n------boundary--\r\n`;
    const result = await parser.parseMultipartFormData(multipartData, boundary);
    expect(result[0].contentDisposition.filename).toBe('test.txt');
  });

  it('should parse multiple parts', async () => {
    const boundary = '----boundary';
    const multipartData = `------boundary\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n------boundary\r\nContent-Disposition: form-data; name="field2"\r\n\r\nvalue2\r\n------boundary--\r\n`;
    const result = await parser.parseMultipartFormData(multipartData, boundary);
    expect(result).toHaveLength(2);
  });
});
```

## Integration Tests

### Full Request Parsing
```typescript
describe('Full Request Parsing', () => {
  it('should parse complete HTTP request', async () => {
    const request = 'GET / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n';
    const result = await parser.parse(request);
    expect(result.method).toBe(HttpMethod.GET);
    expect(result.uri).toBe('/');
    expect(result.version).toBe(HttpVersion.HTTP_1_1);
    expect(result.headers.get('host')).toBe('localhost');
  });

  it('should parse request with body', async () => {
    const request = 'POST /api/users HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"name":"John"}';
    const result = await parser.parse(request);
    expect(result.method).toBe(HttpMethod.POST);
    expect(result.body.toString()).toBe('{"name":"John"}');
  });

  it('should parse request with query string', async () => {
    const request = 'GET /search?q=test&page=1 HTTP/1.1\r\nHost: localhost\r\n\r\n';
    const result = await parser.parse(request);
    expect(result.uri).toBe('/search');
    expect(result.queryString.q).toBe('test');
    expect(result.queryString.page).toBe('1');
  });
});
```

### Error Recovery Tests
```typescript
describe('Error Recovery', () => {
  it('should handle malformed request in lenient mode', async () => {
    parser.setMode(ParseMode.LENIENT);
    const request = 'GET / HTTP/1.1\r\nInvalid Header\r\n\r\n';
    const result = await parser.parse(request);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should reject malformed request in strict mode', async () => {
    parser.setMode(ParseMode.STRICT);
    const request = 'GET / HTTP/1.1\r\nInvalid Header\r\n\r\n';
    await expect(parser.parse(request)).rejects.toThrow();
  });
});
```

## Advanced Feature Tests

### Streaming Parser Tests
```typescript
describe('Streaming Parser', () => {
  it('should handle chunked input', () => {
    const streamParser = new StreamingHttpRequestParser();
    streamParser.feed(Buffer.from('GET / HTTP/1.1\r\n'));
    streamParser.feed(Buffer.from('Host: localhost\r\n'));
    streamParser.feed(Buffer.from('\r\n'));
    expect(streamParser.isComplete()).toBe(true);
  });

  it('should emit events during parsing', (done) => {
    const streamParser = new StreamingHttpRequestParser();
    streamParser.on('header', (header) => {
      expect(header.name).toBeDefined();
    });
    streamParser.on('complete', () => {
      done();
    });
    streamParser.feed(Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'));
  });
});
```

### Configuration Tests
```typescript
describe('Configuration', () => {
  it('should respect max body size limit', async () => {
    const config = { maxBodySize: 100 };
    parser.updateConfig(config);
    const request = 'POST / HTTP/1.1\r\nContent-Length: 200\r\n\r\n';
    await expect(parser.parse(request)).rejects.toThrow(ParseError.BODY_TOO_LARGE);
  });

  it('should update configuration at runtime', () => {
    const oldMaxHeaders = parser.config.maxHeadersCount;
    parser.updateConfig({ maxHeadersCount: 200 });
    expect(parser.config.maxHeadersCount).toBe(200);
    expect(parser.config.maxHeadersCount).not.toBe(oldMaxHeaders);
  });
});
```

## Performance Tests

### Benchmark Tests
```typescript
describe('Performance Benchmarks', () => {
  it('should parse small requests quickly', async () => {
    const request = 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n';
    const start = Date.now();
    await parser.parse(request);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1); // < 1ms
  });

  it('should handle large bodies efficiently', async () => {
    const body = Buffer.alloc(1024 * 1024); // 1MB
    const request = `POST / HTTP/1.1\r\nContent-Length: ${body.length}\r\n\r\n${body.toString()}`;
    const start = Date.now();
    await parser.parse(request);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // < 100ms
  });
});
```

## RFC Compliance Tests

### RFC 7230 Compliance
```typescript
describe('RFC 7230 Compliance', () => {
  it('should handle obsolete line folding', async () => {
    const request = 'GET / HTTP/1.1\r\nHost: localhost\r\nX-Custom: value1\r\n value2\r\n\r\n';
    const result = await parser.parse(request);
    expect(result.headers.get('x-custom')).toContain('value1');
  });

  it('should reject CRLF in header values', async () => {
    const request = 'GET / HTTP/1.1\r\nHost: localhost\r\nX-Custom: value\r\ninjected\r\n\r\n';
    await expect(parser.parse(request)).rejects.toThrow();
  });
});
```

## Security Tests

### Input Validation Tests
```typescript
describe('Security', () => {
  it('should reject null bytes in headers', async () => {
    const request = 'GET / HTTP/1.1\r\nHost: localho\x00st\r\n\r\n';
    await expect(parser.parse(request)).rejects.toThrow();
  });

  it('should reject oversized headers', async () => {
    const longHeader = 'X-Long: ' + 'x'.repeat(10000);
    const request = `GET / HTTP/1.1\r\n${longHeader}\r\n\r\n`;
    await expect(parser.parse(request)).rejects.toThrow(ParseError.HEADER_VALUE_TOO_LONG);
  });

  it('should reject oversized body', async () => {
    const request = 'POST / HTTP/1.1\r\nContent-Length: 10000000\r\n\r\n';
    await expect(parser.parse(request)).rejects.toThrow(ParseError.BODY_TOO_LARGE);
  });
});
```

## Test Utilities

### Mock Helpers
```typescript
class MockHttpRequestParser implements IHttpRequestParser {
  async parse(request: string): Promise<HttpRequest> {
    // Mock implementation
    return {} as HttpRequest;
  }
}

function createTestRequest(method: HttpMethod, uri: string): string {
  return `${method} ${uri} HTTP/1.1\r\nHost: localhost\r\n\r\n`;
}
```

### Test Helpers
```typescript
function createParser(config?: Partial<ParserConfig>): HttpRequestParser {
  return new HttpRequestParser({ ...DEFAULT_CONFIG, ...config });
}

function assertParseError(error: ParseError, expected: ParseError): void {
  expect(error).toBe(expected);
}
```

## Running Tests

### Unit Tests
```bash
npm run test:unit -- src/layers/http-parser
```

### Integration Tests
```bash
npm run test:integration -- src/layers/http-parser
```

### All Tests
```bash
npm test -- src/layers/http-parser
```

### Coverage Report
```bash
npm run test:coverage -- src/layers/http-parser
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
name: HTTP Parser Tests

on:
  pull_request:
    paths:
      - 'src/layers/http-parser/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- src/layers/http-parser
      - run: npm run test:integration -- src/layers/http-parser
      - run: npm run test:coverage -- src/layers/http-parser
      - uses: codecov/codecov-action@v3
```

## Best Practices

### Test Writing Guidelines
- Write descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- One assertion per test when possible
- Mock external dependencies
- Test edge cases and boundary conditions
- Test error scenarios
- Maintain test independence

### Coverage Guidelines
- Maintain 95%+ coverage
- Focus on critical paths
- Test all error branches
- Validate type safety
- Test configuration options
