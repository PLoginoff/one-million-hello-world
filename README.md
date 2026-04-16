# One Million Hello World

This project is a fully-featured implementation of a classic HTTP server returning "Hello World" using enterprise-grade architectural patterns and best practices.

The codebase contains **1 million lines** (currently 30k)

![Progress](https://img.shields.io/badge/progress-8%25-red)

## Goal

Demonstration of a comprehensive architectural implementation applying clean architecture principles, SOLID, design patterns, and enterprise-level development approaches. The project illustrates how a systematic approach to abstraction and modularity can be applied even to tasks with minimal functional complexity, ensuring high maintainability, testability, and system extensibility.

## Architecture

The project is implemented following clean architecture principles, ensuring strict isolation of business logic from infrastructure dependencies and adherence to the Dependency Rule. The architecture is built on concentric layers with a unidirectional dependency flow, guaranteeing testability, maintainability, and system scalability. Each layer solves a specific task and interacts with other layers exclusively through well-defined interfaces, implementing dependency inversion and separation of concerns principles.

```
HTTP Request
    ↓
Network Layer (TCP/IP abstraction, socket management)
    ↓
HTTP Parser Layer (Request parsing, headers, body)
    ↓
Security Layer (CORS, Auth, encryption, threat detection)
    ↓
Rate Limiting Layer (IP-based, user-based, API key limits)
    ↓
Validation Layer (Schema validation, sanitization, type checking)
    ↓
Middleware Layer (Logging, Metrics, Tracing, Correlation IDs)
    ↓
Router Layer (Route matching, parameter extraction, wildcards)
    ↓
Controller Layer (Request handling, orchestration, response codes)
    ↓
Service Layer (Business logic, use cases, domain operations)
    ↓
Domain Layer (Core entities, value objects, domain events)
    ↓
Repository Layer (Data access abstraction, query builders)
    ↓
Cache Layer (Multi-level caching, invalidation strategies)
    ↓
Event Layer (Event bus, Pub/Sub, domain event propagation)
    ↓
Message Queue Layer (Async processing, dead letter queues)
    ↓
Data Transformation Layer (Normalization, enrichment, mapping)
    ↓
Serialization Layer (Response serialization, versioning, content negotiation)
    ↓
Compression Layer (Gzip, Brotli, dynamic compression)
    ↓
Circuit Breaker Layer (Fault tolerance, fallback strategies)
    ↓
Retry Layer (Exponential backoff, jitter, idempotency)
    ↓
Saga Layer (Distributed transactions, compensation)
    ↓
Strategy Layer (Execution strategies, A/B testing, feature flags)
    ↓
Facade Layer (Simplified interfaces, aggregation, composition)
    ↓
Proxy Layer (Access control, lazy loading, caching proxy)
    ↓
Decorator Layer (Runtime decoration, cross-cutting concerns)
    ↓
Transport Layer (HTTP response, streaming, chunked encoding)
```

### Logging

Logs at **every level**:
- Structured logging (JSON format)
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Correlation IDs for request tracing
- Performance metrics at each layer
- Error tracking with stack traces
- Audit logging
- Distributed tracing (OpenTelemetry)

### Technologies

- **TypeScript** with strict typing
- **Express.js** - HTTP framework
- **Winston** - Logging
- **Zod** - Schema validation
- **RxJS** - Reactive streams
- **Inversify** - Dependency Injection
- **OpenTelemetry** - Distributed tracing

## Architectural Rules and Standards

### Clean Architecture

- **Dependency Rule**: dependencies point inward (outer layers depend on inner layers)
- **Entities**: business logic does not depend on frameworks, UI, or databases
- **Use Cases**: application-specific business rules
- **Interface Adapters**: data transformation from use cases format to external systems format
- **Frameworks & Drivers**: external tools (Express, Winston, etc.)

### SOLID Principles

**S - Single Responsibility Principle:**
- Each class has one reason to change
- Each layer is responsible for one function
- Each file contains one entity

**O - Open/Closed Principle:**
- Open for extension, closed for modification
- Use interfaces to extend functionality
- Strategy Pattern for variable behavior

**L - Liskov Substitution Principle:**
- Subtypes must be substitutable for base types
- Interface contracts are strictly followed
- Violations are logged as errors

**I - Interface Segregation Principle:**
- Many small interfaces instead of one large interface
- Clients do not depend on methods they don't use
- Each layer has its own set of interfaces

**D - Dependency Inversion Principle:**
- Higher-level modules do not depend on lower-level modules
- Both depend on abstractions
- Dependency Injection via Inversify

### Layer Rules

**Strict Isolation:**
- Layer N can only access layer N-1
- Direct calls between non-consecutive layers are prohibited
- Bypassing layers via Service Locator pattern is prohibited

**Unidirectional Flow:**
- Movement only from top to bottom (Request → Response)
- Lower layers are unaware of upper layers
- Event Bus for feedback (only through events)

**Interfaces Between Layers:**
- Each layer exports only interfaces
- Implementation is hidden inside the layer
- TypeScript types for contracts

### Testing

**Code Coverage:**
- Minimum coverage: **95%**
- Target coverage: **99%+**
- Branch coverage: **90%+**

**Test Types:**

1. **Unit Tests** (80% of all tests):
   - Test individual functions/classes
   - Mock all dependencies
   - Isolation from external systems
   - Speed: < 1ms per test

2. **Integration Tests** (15%):
   - Test layer interaction
   - In-memory implementations of external dependencies
   - Verify contracts between layers
   - Speed: < 10ms per test

3. **E2E Tests** (5%):
   - Full path HTTP Request → Response
   - Real HTTP server
   - Real logs and metrics
   - Speed: < 100ms per test

**Test Pyramid:**
```
        /\
       /E2E\      (5%)
      /------\
     /Integration\ (15%)
    /------------\
   /   Unit Tests  \ (80%)
  /----------------\
```

**Test Writing Rules:**
- AAA pattern (Arrange, Act, Assert)
- Descriptive test names
- One assertion per test
- Independent tests (no shared state)
- Deterministic results
- Mock everything external

**Mutation Testing:**
- Use Stryker to verify test quality
- Goal: kill 100% of mutants
- Identify "dead" code in tests

### Code Style

**TypeScript strict mode:**
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `strictFunctionTypes: true`
- `noImplicitThis: true`

**ESLint + Prettier:**
- Max line length: 120
- Single quotes
- Semicolons required
- No unused variables
- Explicit return types

**Naming conventions:**
- Classes: PascalCase
- Interfaces: PascalCase with I prefix (IUserService)
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Private properties: _prefix
- Files: kebab-case

### Documentation

**TSDoc:**
- Every public method is documented
- @param for each parameter
- @returns for return values
- @throws for exceptions
- Usage examples

**Architecture Decision Records (ADR):**
- Every architectural decision is documented
- Format: Context, Decision, Consequences
- Stored in /docs/adr/

### CI/CD

**GitHub Actions:**
- Linting on every PR
- Unit tests on every PR
- Integration tests on merge
- E2E tests on release
- Coverage report on every build

**Quality Gates:**
- Build fails if coverage < 95%
- Build fails if lint errors
- Build fails if test failures
- Mutation testing weekly

## How to Run

```bash
# Install dependencies
npm install

# Start server
npm start

# Start with logs
npm run start:dev
```

Server will be available at `http://localhost:3000`

## API

### GET /

Returns classic "Hello, World!"

## Statistics

- **Lines of code**: 1,000,000 (goal)
- **Files**: TBD
- **Architecture layers**: 25
- **TypeScript types**: TBD
- **Size**: TBD

## License

MIT
