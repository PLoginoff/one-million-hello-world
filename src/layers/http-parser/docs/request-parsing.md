# Request Parsing

## Overview
The HTTP Parser Layer implements comprehensive request parsing capabilities following RFC 7230 and related specifications. The parsing process is divided into distinct phases for clarity and maintainability.

## Request Line Parsing

### Request Line Structure
```
METHOD SP REQUEST-URI SP HTTP-VERSION CRLF
```

### Parsing Process
```typescript
interface RequestLine {
  method: HttpMethod;
  uri: string;
  version: HttpVersion;
}

enum HttpMethod {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
  TRACE,
  CONNECT
}

enum HttpVersion {
  HTTP_1_0,
  HTTP_1_1,
  HTTP_2_0
}
```

### Request Line Validation
- Method must be valid HTTP method
- URI must be properly formatted
- Version must be supported
- Single space between components
- CRLF termination required

### Error Handling
- Invalid method: ParseError.INVALID_METHOD
- Invalid URI: ParseError.INVALID_URI
- Invalid version: ParseError.INVALID_VERSION
- Missing components: ParseError.MALFORMED_REQUEST_LINE

## Header Parsing

### Header Structure
```
HEADER-NAME ":" OWS HEADER-VALUE OWS CRLF
```

### Header Processing Pipeline
1. Read header line
2. Split at first colon
3. Normalize header name to lowercase
4. Trim whitespace from value
5. Store in Map for O(1) lookup
6. Handle continuation lines (obsolete)

### Header Validation
- Header name must not contain invalid characters
- Header value must not exceed configured limit
- Duplicate headers handled according to RFC
- Empty headers allowed for certain cases

### Common Headers
```typescript
interface HttpHeaders {
  'content-type': string;
  'content-length': string;
  'host': string;
  'user-agent': string;
  'accept': string;
  'authorization': string;
  'cookie': string;
  // ... additional headers
}
```

## Body Parsing

### Body Detection
- Content-Length header indicates body size
- Transfer-Encoding: chunked indicates chunked encoding
- GET/HEAD requests typically have no body
- Multipart content type indicates multipart body

### Fixed-Length Body
```typescript
async parseFixedBody(contentLength: number): Promise<Buffer> {
  if (contentLength > this.config.maxBodySize) {
    throw ParseError.BODY_TOO_LARGE;
  }
  
  const body = await this.readBytes(contentLength);
  return body;
}
```

### Chunked Encoding
```typescript
interface Chunk {
  size: number;
  data: Buffer;
  extensions: string[];
}

async parseChunkedBody(): Promise<Buffer> {
  const chunks: Chunk[] = [];
  let totalSize = 0;
  
  while (true) {
    const chunk = await this.parseChunk();
    if (chunk.size === 0) break; // Last chunk
    
    totalSize += chunk.size;
    if (totalSize > this.config.maxBodySize) {
      throw ParseError.BODY_TOO_LARGE;
    }
    
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks.map(c => c.data));
}
```

## Query String Parsing

### Query String Format
```
?param1=value1&param2=value2&param3=value3
```

### Parsing Algorithm
```typescript
interface QueryParams {
  [key: string]: string | string[];
}

function parseQueryString(queryString: string): QueryParams {
  const params: QueryParams = {};
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    const decodedKey = decodeURIComponent(key);
    const decodedValue = value ? decodeURIComponent(value) : '';
    
    if (params[decodedKey]) {
      // Handle multiple values
      if (Array.isArray(params[decodedKey])) {
        params[decodedKey].push(decodedValue);
      } else {
        params[decodedKey] = [params[decodedKey], decodedValue];
      }
    } else {
      params[decodedKey] = decodedValue;
    }
  }
  
  return params;
}
```

## Cookie Parsing

### Cookie Header Format
```
Cookie: name1=value1; name2=value2; name3=value3
```

### Parsing Process
```typescript
interface Cookie {
  name: string;
  value: string;
  attributes?: CookieAttributes;
}

interface CookieAttributes {
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

function parseCookieHeader(cookieHeader: string): Cookie[] {
  const cookies: Cookie[] = [];
  const pairs = cookieHeader.split(';');
  
  for (const pair of pairs) {
    const [name, value] = pair.trim().split('=');
    cookies.push({
      name: name.trim(),
      value: value?.trim() || ''
    });
  }
  
  return cookies;
}
```

## MIME Type Parsing

### MIME Type Format
```
type/subtype; parameter=value; parameter=value
```

### Parsing Algorithm
```typescript
interface MimeType {
  type: string;
  subtype: string;
  charset?: string;
  boundary?: string;
  parameters: Map<string, string>;
}

function parseMimeType(mimeType: string): MimeType {
  const [typeSubtype, ...paramStrings] = mimeType.split(';');
  const [type, subtype] = typeSubtype.trim().split('/');
  
  const parameters = new Map<string, string>();
  for (const paramString of paramStrings) {
    const [key, value] = paramString.trim().split('=');
    parameters.set(key, value?.replace(/"/g, '') || '');
  }
  
  return {
    type: type.trim(),
    subtype: subtype.trim(),
    charset: parameters.get('charset'),
    boundary: parameters.get('boundary'),
    parameters
  };
}
```

## Content-Disposition Parsing

### Content-Disposition Format
```
Content-Disposition: form-data; name="fieldName"; filename="file.txt"
```

### Parsing Process
```typescript
interface ContentDisposition {
  type: 'inline' | 'attachment' | 'form-data';
  name?: string;
  filename?: string;
  parameters: Map<string, string>;
}

function parseContentDisposition(header: string): ContentDisposition {
  const [type, ...paramStrings] = header.split(';');
  const parameters = new Map<string, string>();
  
  for (const paramString of paramStrings) {
    const [key, value] = paramString.trim().split('=');
    const cleanValue = value?.replace(/"/g, '') || '';
    parameters.set(key, cleanValue);
  }
  
  return {
    type: type.trim() as 'inline' | 'attachment' | 'form-data',
    name: parameters.get('name'),
    filename: parameters.get('filename'),
    parameters
  };
}
```

## Multipart Form Data Parsing

### Multipart Structure
```
--boundary
Content-Disposition: form-data; name="field1"

value1
--boundary
Content-Disposition: form-data; name="file"; filename="file.txt"

file content
--boundary--
```

### Parsing Process
```typescript
interface MultipartPart {
  headers: Map<string, string>;
  contentDisposition?: ContentDisposition;
  contentType?: MimeType;
  data: Buffer;
}

async parseMultipartFormData(boundary: string): Promise<MultipartPart[]> {
  const parts: MultipartPart[] = [];
  const boundaryLine = `--${boundary}`;
  
  // Parse each part between boundaries
  // Handle headers and content for each part
  
  return parts;
}
```

## State Machine

### Parser States
```typescript
enum ParserState {
  IDLE,
  PARSING_REQUEST_LINE,
  PARSING_HEADERS,
  PARSING_BODY,
  COMPLETE,
  ERROR
}
```

### State Transitions
```
IDLE → PARSING_REQUEST_LINE (on data received)
PARSING_REQUEST_LINE → PARSING_HEADERS (request line complete)
PARSING_HEADERS → PARSING_BODY (headers complete)
PARSING_BODY → COMPLETE (body complete)
ANY → ERROR (on parsing error)
ERROR → IDLE (after reset)
```

### State Management
```typescript
class HttpRequestParser {
  private state: ParserState = ParserState.IDLE;
  
  setState(newState: ParserState): void {
    this.state = newState;
    this.logStateChange(newState);
  }
  
  reset(): void {
    this.state = ParserState.IDLE;
    this.buffer = Buffer.alloc(0);
  }
}
```

## Performance Considerations

### Buffer Management
- Reuse buffers when possible
- Limit buffer growth to prevent memory exhaustion
- Stream processing for large bodies
- Zero-copy operations where feasible

### Optimization Strategies
- Header name normalization during parsing
- Map-based storage for O(1) header lookup
- Lazy parsing of optional components
- Caching of parsed results

### Memory Efficiency
- Strict size limits enforced
- Buffer pooling for allocations
- Early rejection of oversized requests
- Memory pressure monitoring

## Best Practices

### Parsing Guidelines
- Always validate input before processing
- Enforce size limits strictly
- Handle malformed input gracefully
- Log parsing errors for debugging
- Maintain parser state consistency

### Security Considerations
- Validate all input data
- Prevent buffer overflow attacks
- Handle malicious input patterns
- Enforce rate limits
- Sanitize parsed data
