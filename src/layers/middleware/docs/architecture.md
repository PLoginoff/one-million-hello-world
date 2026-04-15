# Middleware Layer Architecture

## Status
Accepted (Expanded)

## Context
The Middleware Layer is responsible for cross-cutting concerns including logging, metrics, tracing, and correlation ID management. It receives requests from the Validation Layer and applies middleware operations before passing to the Router Layer. The layer has been significantly expanded to support advanced logging categories, metric aggregation, distributed tracing with events/links, health checks, diagnostics, statistics tracking, and pipeline management.

## Decision
We chose to implement the Middleware Layer with the following expanded design:

### Components
1. **IMiddlewareManager Interface**: Defines the contract for middleware operations with 40+ methods
2. **MiddlewareManager Implementation**: Concrete manager with comprehensive logging, metrics, tracing, correlation, pipelines, health, diagnostics, and statistics
3. **Type Definitions**: Extensive types including 8 new enums and 15+ new interfaces

### Key Design Decisions

**Advanced Logging**
- Structured log entries with timestamps, categories, and metadata
- Extended log levels (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)
- Log categories (GENERAL, HTTP, DATABASE, CACHE, SECURITY, PERFORMANCE, BUSINESS, SYSTEM)
- Configurable log level filtering by category
- Log metadata support for structured data
- Log output formats (JSON, TEXT, PRETTY)
- Log output targets (CONSOLE, FILE, REMOTE, BOTH)
- Log filtering by level, category, time range, message pattern, and limit
- Log aggregation with statistics by level and top messages

**Advanced Metrics**
- Multiple metric types (COUNTER, GAUGE, HISTOGRAM, SUMMARY)
- Metric aggregation types (SUM, AVG, MIN, MAX, COUNT, P50, P95, P99)
- Label support for metric categorization
- Timestamp tracking for each metric
- Configurable flush interval
- In-memory metric storage with statistics
- Metric statistics calculation (count, sum, avg, min, max, percentiles)
- Metric filtering by name, type, labels, and time range
- Metric aggregation with detailed statistics

**Advanced Tracing**
- Distributed tracing with trace and span IDs
- Parent-child span relationships
- Operation name tracking
- Automatic duration calculation
- Tag support for span metadata
- Span events with timestamps, names, and attributes
- Span links for cross-trace relationships
- Span status (OK, ERROR, CANCELLED, TIMEOUT, UNKNOWN)
- Span error tracking with type, message, and stack
- Span sampling for performance optimization
- Span filtering by trace ID, operation name, status, and time range
- Span retrieval by trace ID and span ID

**Correlation IDs**
- Request ID generation and tracking
- Correlation ID for request tracing
- Trace ID for distributed tracing
- User ID association
- Header-based ID propagation
- Correlation context retrieval by request ID
- Clear correlation contexts for cleanup

**Pipeline Management**
- Middleware pipelines for modular processing
- Pipeline stages with types (LOGGING, METRICS, TRACING, CORRELATION, AUTHENTICATION, AUTHORIZATION, CACHING, RATE_LIMITING, CUSTOM)
- Pipeline enable/disable functionality
- Stage ordering and management
- Pipeline retrieval and listing

**Health Checks**
- Health status monitoring with status (healthy, degraded, unhealthy)
- Health score calculation (0-100)
- Component-specific health checks
- Detailed check results with status and messages

**Diagnostics**
- Comprehensive diagnostics with trace ID
- Step-by-step diagnostic checks
- Diagnostic summary with overall status
- Detailed step results

**Statistics Tracking**
- Total logs, metrics, and spans tracking
- Uptime tracking
- Statistics reset capability
- Real-time statistics retrieval

**Configuration**
- Feature toggles for each middleware component
- Configurable log levels
- Configurable metrics flush interval
- Runtime configuration updates
- Configuration retrieval

**Data Management**
- Clear operations for logs, metrics, spans, and correlation contexts
- Flush operations for metrics and logs
- Filtered data retrieval

### Isolation Strategy
- Middleware Layer depends only on Validation Layer types
- Does not depend on any higher layers
- Exports only interfaces to Router Layer
- Implementation details hidden behind interface

## Consequences

### Positive
- Comprehensive observability with advanced logging categories
- Flexible configuration with runtime updates
- Request tracing across layers with detailed span information
- Structured logging with multiple output formats and targets
- Performance metrics with statistics and aggregation
- Health monitoring and diagnostics
- Pipeline management for modular middleware processing
- Extensive filtering capabilities for logs, metrics, and spans

### Negative
- Memory overhead from log/metric/span storage
- Performance impact from middleware operations
- Complexity from multiple concerns and advanced features
- ID generation overhead
- Increased maintenance complexity

### Alternatives Considered
1. **Use Winston for logging**: Rejected for control and learning purposes
2. **Use Prometheus for metrics**: Rejected for simplicity
3. **Use OpenTelemetry for tracing**: Rejected for control
4. **Separate layers for each concern**: Rejected for cohesion
5. **Use Express middleware**: Rejected for layer independence

## References
- README.md - Architecture overview
- DEVELOPMENT.md - Implementation progress
- logging-metrics.md - Logging and metrics details
- tracing-correlation.md - Tracing and correlation IDs
- pipeline-management.md - Pipeline management
- health-diagnostics.md - Health checks and diagnostics
- testing.md - Testing strategy
