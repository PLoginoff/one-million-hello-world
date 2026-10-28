# One Million Hello World

This project is a fully-featured implementation of a classic HTTP server returning "Hello World" using enterprise-grade architectural patterns and best practices.

The codebase targets **1 million lines** (currently ~63K across all file types)

![Progress](https://img.shields.io/badge/progress-65%25-yellow)

## Contents

- [Goal](#goal)
- [Architecture](#architecture)
  - [Logging](#logging)
  - [Technologies](#technologies)
- [Architectural Rules and Standards](#architectural-rules-and-standards)
  - [Clean Architecture](#clean-architecture)
  - [SOLID Principles](#solid-principles)
  - [Layer Rules](#layer-rules)
  - [Testing](#testing)
  - [Code Style](#code-style)
  - [Documentation](#documentation)
  - [CI/CD](#cicd)
- [Setup](#setup)
- [How to Run](#how-to-run)
- [API](#api)
- [Actual Statistics](#actual-statistics)
- [Expected Statistics](#expected-statistics)
- [License](#license)
- [Authors](#authors)

------------------------------------

## Goal

Demonstration of a comprehensive architectural implementation applying clean architecture principles, SOLID, design patterns, and enterprise-level development approaches. The project illustrates how a systematic approach to abstraction and modularity can be applied even to tasks with minimal functional complexity, ensuring high maintainability, testability, and system extensibility.

------------------------------------

## Architecture

The project is implemented following clean architecture principles, ensuring strict isolation of business logic from infrastructure dependencies and adherence to the Dependency Rule. The architecture is built on concentric layers with a unidirectional dependency flow, guaranteeing testability, maintainability, and system scalability. Each layer solves a specific task and interacts with other layers exclusively through well-defined interfaces, implementing dependency inversion and separation of concerns principles.

The request flows through a real pipeline: **Network → HTTP Parser → Security → Rate Limiting → Validation → Middleware → Router → Controller → Service → Domain → Repository → Cache → Event → Message Queue → Data Transformation → Serialization → Compression → Circuit Breaker → Retry → Saga → Strategy → Facade → Proxy → Decorator → Transport**. Each arrow is a directed interface call, not a conceptual relationship.

In addition to the original 25 vertical layers, the architecture includes **20+ horizontal cross-cutting layers**: API Gateway, Load Balancer, Service Discovery, Feature Flags, Configuration, Secrets, Audit, Observability, Edge Cache, Schema Registry, Identity, Authorization, Encryption, Backup, Migrations, GraphQL, WebSocket, Message Bus, Throttling, Analytics, and more.

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
    ↓
Horizontal Layers (API Gateway, Load Balancer, Observability, ...)
    ↓
HTTP Response
```

------------------------------------

### Logging

Logs at **every level**:
- Structured logging (JSON format)
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Correlation IDs for request tracing
- Performance metrics at each layer
- Error tracking with stack traces
- Audit logging
- Distributed tracing (OpenTelemetry)

------------------------------------

### Technologies

- **TypeScript** with strict typing
- **Express.js** - HTTP framework
- **Winston** - Logging
- **Zod** - Schema validation
- **RxJS** - Reactive streams
- **Inversify** - Dependency Injection
- **OpenTelemetry** - Distributed tracing

------------------------------------

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

------------------------------------

## Setup

Run commands:
```
make install
make build
make start-dev
```

------------------------------------

## How to Run

All common tasks are available through **Makefile**:

```bash
# Install dependencies
make install

# Build the project
make build

# Start production server
make start

# Start development server with hot reload
make start-dev

# Run tests
make test

# Run linter
make lint

# Format code
make format

# Show project statistics (files, lines, commits)
make stats
```

Or use npm directly:

```bash
# Install dependencies
npm install

# Start server
npm start

# Start with logs
npm run start:dev
```

Server will be available at `http://localhost:3000`

------------------------------------

## API

### GET /

Returns classic "Hello, World!" with multi-language support.

**Query parameters:**
- `language` — language code (`en`, `es`, `fr`, `de`, `it`, `pt`, `ru`, `zh`, `ja`, `ko`). Default: `en`.
- `format` — response format (`json`, `plain`, `html`). Default: `json`.
- `suffix` — optional suffix appended to the message.

**Example:** `GET /?language=ru`

```json
{
  "message": "Привет мир",
  "timestamp": "2026-07-07T15:44:56.631Z",
  "language": "ru",
  "format": "json",
  "requestId": "...",
  "supportedLanguages": ["en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko"]
}
```

### GET /health

Returns application health status with component checks.

### GET /metrics

Returns runtime metrics: layer count, request count, memory usage, uptime.

### GET /version

Returns application version, environment, Node.js version, and architecture metadata.

------------------------------------

## Deployment

### Docker

```bash
docker build -t one-million-hello-world .
docker run -p 3000:3000 one-million-hello-world
```

### Docker Compose (with Redis, Prometheus, Grafana)

```bash
docker-compose up -d
```

### Kubernetes

```bash
kubectl apply -f infrastructure/k8s/
```

### Helm

```bash
helm install hello-world ./infrastructure/helm/one-million-hello-world
```

### Terraform (AWS)

```bash
cd infrastructure/terraform
terraform init
terraform apply -var="image_uri=your-ecr-image-uri"
```

------------------------------------

## Actual Statistics

Run `npm run cli -- stats` to see current numbers.

Latest snapshot (after Epics 1-7):
- **Total files**: 4,551
- **Total lines (all types)**: ~63,000
- **TypeScript files**: 3,892
- **TypeScript lines**: ~15,000
- **Markdown lines**: ~55,000
- **Architecture layers**: 105
- **Test suites**: 379
- **Tests**: 5,108
- **Test coverage**: ~31%
- **Infrastructure**: Terraform (AWS/GCP/Azure), K8s, Helm, Docker, Prometheus, Grafana, Loki, Alertmanager
- **CI/CD**: 7 GitHub Actions workflows (CI, release, Docker, Terraform, Helm, security scan, badge)
- **Documentation**: 15 ADRs, 104 per-layer docs, OpenAPI spec, runbook, deployment guide

------------------------------------

## Expected Statistics

- **Lines of code**: 1,000,000 (goal — currently ~63K, ~6%)
- **Architecture layers**: 105 (achieved)
- **Files**: 4,551 (achieved 3,000+ target)
- **Test suites**: 379 (5,108 tests)
- **Test coverage**: 95%+ (target — currently ~31%)
- **Deployment targets**: Docker, Kubernetes, AWS, GCP, Azure (achieved)

------------------------------------

------------------------------------

## License

**MIT**

------------------------------------

## Authors
- Pavel Loginov <ploginoff@gmail.com>
- Ikonnikov Mikhail <mishaikon@gmail.com>

------------------------------------