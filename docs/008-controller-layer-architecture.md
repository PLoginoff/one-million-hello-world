# ADR 008: Controller Layer Architecture

## Status
Accepted

## Context
The Controller Layer (Layer 8) is responsible for request handling, orchestration, and response code generation. It receives requests from the Router Layer and coordinates with the Service Layer to execute business logic.

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
- ADR 001 - Network Layer Architecture
- ADR 002 - HTTP Parser Layer Architecture
- ADR 003 - Security Layer Architecture
- ADR 004 - Rate Limiting Layer Architecture
- ADR 005 - Validation Layer Architecture
- ADR 006 - Middleware Layer Architecture
- ADR 007 - Router Layer Architecture
