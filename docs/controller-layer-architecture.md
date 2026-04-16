# ADR: Controller Layer Architecture

## Status
Accepted

## Context
The Controller Layer is responsible for request handling, orchestration, and response code generation. It receives requests from the Router Layer and coordinates with the Service Layer to execute business logic.

## Decision
We chose to implement the Controller Layer with the following design:

### Components
1. **IController Interface**: Defines the contract for controller operations
2. **Controller Implementation**: Concrete controller with handler management
3. **Type Definitions**: Comprehensive types for responses, contexts, and handlers

### Key Design Decisions

**Request Handling**
- Handler-based request processing
- Async handler execution
- Error handling and conversion
- Context propagation

**Response Generation**
- Success response creation with configurable status codes
- Error response creation with details
- Automatic header generation
- JSON body formatting

**Context Management**
- Request ID extraction and generation
- Correlation ID tracking
- User ID association
- Parameter passing
- Header preservation

**Handler Registry**
- Dynamic handler registration
- Operation-based handler lookup
- Handler function type definition
- Handler execution orchestration

**Error Handling**
- Automatic error catching
- Error response generation
- Status code mapping
- Error detail inclusion

### Isolation Strategy
- Controller Layer depends only on Router Layer types
- Does not depend on any higher layers
- Exports only interfaces to Service Layer
- Implementation details hidden behind interface

## Detailed Documentation

For detailed information about specific aspects of the Controller Layer, see:

- [Architecture Overview](../src/layers/controller/docs/architecture.md) - Components, isolation strategy, consequences
- [Request Handling](../src/layers/controller/docs/request-handling.md) - Handler registry, context building, execution
- [Response Generation](../src/layers/controller/docs/response-generation.md) - Success/error responses, headers, caching
- [Error Handling](../src/layers/controller/docs/error-handling.md) - Error types, handling strategies, recovery
- [Testing Strategy](../src/layers/controller/docs/testing.md) - Unit/integration tests, performance tests, coverage targets

## Consequences

### Positive
- Flexible handler system
- Comprehensive error handling
- Context propagation support
- Configurable responses
- Clean separation of concerns

### Negative
- Handler registry complexity
- Async overhead
- Error handling overhead
- Memory overhead from handler storage

### Alternatives Considered
1. **Use Express controllers**: Rejected for control and learning purposes
2. **Direct function calls**: Rejected for flexibility
3. **No handler registry**: Rejected for extensibility
4. **Synchronous handlers only**: Rejected for performance

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- network-layer-architecture.md - Network Layer Architecture
- http-parser-layer-architecture.md - HTTP Parser Layer Architecture
- security-layer-architecture.md - Security Layer Architecture
- rate-limiting-layer-architecture.md - Rate Limiting Layer Architecture
- validation-layer-architecture.md - Validation Layer Architecture
- middleware-layer-architecture.md - Middleware Layer Architecture
- router-layer-architecture.md - Router Layer Architecture
