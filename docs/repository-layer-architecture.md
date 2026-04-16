# ADR: Repository Layer Architecture

## Status
Updated with Query Builder and Handler layers

## Context
The Repository Layer provides data access abstraction with three-tier architecture:
1. **Repository Core**: Basic CRUD operations
2. **Query Builder**: Fluent API for complex queries
3. **Repository Handler**: Business logic encapsulation

## Decision
We chose to implement a multi-layered repository architecture with the following design:

### Components

**Repository Core Layer**
- `IRepository` interface: Basic CRUD contract
- `Repository` implementation: In-memory data store
- Repository types: Core type definitions

**Query Builder Layer**
- `IQueryBuilder` interface: Fluent query building contract
- `QueryBuilder` implementation: Fluent API with chaining
- Query builder types: State and configuration types

**Repository Handler Layer**
- `IRepositoryHandler` interface: Handler operation contract
- `RepositoryHandler` implementation: Business logic with validation
- Handler types: Operations, middleware, and validation types

### Key Design Decisions

**Separation of Concerns**
- Repository: Data access only
- Query Builder: Query construction
- Handler: Business logic and validation

**Fluent API**
- Method chaining for query building
- Immutable query state
- Reset functionality for reusability

**Validation & Metrics**
- Configurable validation rules
- Execution time tracking
- Middleware support for cross-cutting concerns

**Error Handling**
- Typed error responses
- Retry configuration
- Detailed error information

### Layer Interaction

```
┌─────────────────────────────────────────┐
│         Service Layer                    │
└──────────────────┬────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│      Repository Handler Layer            │
│  - Validation                            │
│  - Metrics                               │
│  - Middleware                            │
└──────────────────┬────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│       Query Builder Layer                │
│  - Fluent API                            │
│  - Filtering                             │
│  - Sorting & Pagination                 │
└──────────────────┬────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│        Repository Core Layer             │
│  - CRUD Operations                       │
│  - Data Storage                          │
│  - Caching                               │
└─────────────────────────────────────────┘
```

### Isolation Strategy
- Repository Layer depends only on Domain Layer types
- Query Builder depends only on Repository types
- Handler depends on Repository and Domain types
- Each layer exports only interfaces to upper layers
- Implementation details hidden behind interfaces

## Detailed Documentation

For detailed information about specific aspects of the Repository Layer, see:

- [Architecture Overview](../src/layers/repository/docs/architecture.md) - Components, layer interaction, isolation strategy
- [Query Builder](../src/layers/repository/docs/query-builder.md) - Fluent API, filtering, sorting, pagination
- [Handler](../src/layers/repository/docs/handler.md) - Business logic, validation, middleware

## Consequences

### Positive
- Clear separation of concerns
- Flexible query building
- Comprehensive validation support
- Extensible middleware system
- Performance metrics tracking
- Type-safe operations

### Negative
- Increased complexity with multiple layers
- More boilerplate code
- Additional abstraction overhead
- Memory overhead from handler storage

### Alternatives Considered
1. **Single-layer repository**: Rejected for lack of flexibility
2. **ORM integration**: Rejected for learning purposes
3. **Direct database access**: Rejected for abstraction benefits
4. **No handler layer**: Rejected for business logic separation

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
- controller-layer-architecture.md - Controller Layer Architecture
- service-layer-architecture.md - Service Layer Architecture
- domain-layer-architecture.md - Domain Layer Architecture
