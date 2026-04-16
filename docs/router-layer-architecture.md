# ADR: Router Layer Architecture

## Status
Accepted

## Context
The Router Layer is responsible for route matching, parameter extraction, and wildcard support. It receives requests from the Middleware Layer and matches them to registered routes before passing to the Controller Layer.

## Decision
We chose to implement the Router Layer with the following design:

### Components
1. **IRouter Interface**: Defines the contract for routing operations
2. **Router Implementation**: Concrete router with matching and parameter extraction
3. **Type Definitions**: Comprehensive types for routes, parameters, and matching

### Key Design Decisions

**Route Matching**
- Exact path matching
- Method-based routing
- Parameter extraction from path segments
- Wildcard route support
- Case-sensitive matching (configurable)

**Parameter Extraction**
- Named parameters with :prefix syntax
- Automatic parameter value extraction
- Type definitions for parameters
- Pattern validation support

**Configuration**
- Case sensitivity toggle
- Strict routing mode
- Wildcard enable/disable
- Runtime configuration updates

**Route Management**
- Dynamic route registration
- Route removal by method and path
- Clear all routes option
- Route enumeration

**Wildcard Support**
- Glob-style wildcard matching
- Configurable wildcard behavior
- Wildcard flag in match results

### Isolation Strategy
- Router Layer depends only on Middleware Layer types
- Does not depend on any higher layers
- Exports only interfaces to Controller Layer
- Implementation details hidden behind interface

## Detailed Documentation

For detailed information about specific aspects of the Router Layer, see:

- [Architecture Overview](../src/layers/router/docs/architecture.md) - Components, isolation strategy, consequences
- [Route Matching](../src/layers/router/docs/route-matching.md) - Exact matching, method-based routing, case sensitivity
- [Parameter Extraction](../src/layers/router/docs/parameter-extraction.md) - Named parameters, validation, pattern matching
- [Wildcard Support](../src/layers/router/docs/wildcard-support.md) - Glob-style wildcards, double wildcards, trie optimization
- [Testing Strategy](../src/layers/router/docs/testing.md) - Unit/integration tests, performance tests, coverage targets

## Consequences

### Positive
- Flexible routing system
- Parameter extraction support
- Wildcard matching capability
- Configurable behavior
- Dynamic route management

### Negative
- Complexity from multiple matching strategies
- Performance overhead from pattern matching
- Memory overhead from route storage
- Potential for route conflicts

### Alternatives Considered
1. **Use Express router**: Rejected for control and learning purposes
2. **Simple path matching only**: Rejected for flexibility
3. **No parameter extraction**: Rejected for functionality
4. **Tree-based routing**: Rejected for complexity

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- network-layer-architecture.md - Network Layer Architecture
- http-parser-layer-architecture.md - HTTP Parser Layer Architecture
- security-layer-architecture.md - Security Layer Architecture
- rate-limiting-layer-architecture.md - Rate Limiting Layer Architecture
- validation-layer-architecture.md - Validation Layer Architecture
- middleware-layer-architecture.md - Middleware Layer Architecture
