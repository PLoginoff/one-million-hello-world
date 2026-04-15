# ADR: HTTP Parser Layer Architecture

## Status
Accepted

## Context
The HTTP Parser Layer is responsible for parsing raw HTTP request data into structured objects. It receives raw buffers from the Network Layer and produces parsed HttpRequest objects for the Security Layer.

## Decision
We chose to implement the HTTP Parser Layer with the following design:

### Components
1. **IHttpRequestParser Interface**: Defines the contract for parsing HTTP requests
2. **HttpRequestParser Implementation**: Concrete parser with validation
3. **Type Definitions**: Comprehensive types for HTTP protocol elements

### Key Design Decisions

**Parsing Strategy**
- Line-by-line parsing for request line and headers
- Separation of concerns: request line, headers, body parsed separately
- Support for both strict and lenient parsing modes
- Extended parsing with query strings, cookies, MIME types
- Chunked encoding support for large bodies
- Multipart form data parsing

**Error Handling**
- ParseResult type for success/failure indication
- Detailed error codes for different failure scenarios
- Error position tracking for debugging
- Parse warnings for non-fatal issues
- Error count tracking and statistics

**Validation**
- Strict mode enforces RFC compliance
- Method and version validation against enums
- Header format validation with specific error messages
- Configurable validation rules
- Content type and origin validation

**Configuration**
- Configurable limits for header and body sizes
- Default configuration with sensible defaults
- Runtime configuration updates supported
- Extended configuration for advanced features
- Security headers configuration
- CORS configuration
- Rate limiting configuration

**Header Processing**
- Header names normalized to lowercase
- Map-based storage for O(1) lookup
- Empty lines handled gracefully
- Cookie parsing from Cookie header
- Content-Disposition parsing
- MIME type parsing with charset and boundary

**State Management**
- Parser state tracking (IDLE, PARSING_REQUEST_LINE, PARSING_HEADERS, PARSING_BODY, COMPLETE, ERROR)
- State reset capability
- State transitions during parsing

**Statistics and Monitoring**
- Parsing statistics tracking (requests, bytes, headers, bodies)
- Average parse time calculation
- Error count and error type tracking
- Parse metrics with timing breakdown
- Health status checks
- Diagnostic capabilities

**Advanced Features**
- Query string parsing with URL decoding
- Cookie parsing with attribute support
- MIME type parsing with charset and boundary
- Content-Disposition parsing for file uploads
- Chunked encoding parsing
- Multipart form data parsing
- Response parsing support
- Extended parse results with warnings and metrics

### Isolation Strategy
- HTTP Parser Layer depends only on Network Layer types
- Does not depend on any higher layers
- Exports only interfaces to Security Layer
- Implementation details hidden behind interface

## Detailed Documentation

For detailed information about specific aspects of the HTTP Parser Layer, see:

- [Architecture Overview](../src/layers/http-parser/docs/architecture.md) - Components, isolation strategy, consequences
- [Request Parsing](../src/layers/http-parser/docs/request-parsing.md) - Request line, headers, body, query strings, cookies, MIME types
- [Validation and Error Handling](../src/layers/http-parser/docs/validation-error-handling.md) - Validation rules, error types, error recovery, statistics
- [Advanced Features](../src/layers/http-parser/docs/advanced-features.md) - Chunked encoding, multipart, streaming, configuration, security headers
- [Testing Strategy](../src/layers/http-parser/docs/testing.md) - Unit/integration tests, coverage targets, RFC compliance tests

## Consequences

### Positive
- Clean separation of parsing logic
- Type-safe HTTP protocol handling
- Flexible configuration options
- Comprehensive error reporting
- Easy to test with mock data

### Negative
- Additional parsing overhead
- More complex than simple string splitting
- Memory overhead from Map structures

### Alternatives Considered
1. **Use existing HTTP parser library**: Rejected for control and learning purposes
2. **Single-pass parsing**: Rejected for complexity and maintainability
3. **No validation**: Rejected for security and robustness

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- network-layer-architecture.md - Network Layer Architecture
