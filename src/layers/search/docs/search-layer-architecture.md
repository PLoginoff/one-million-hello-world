# Search Layer

## Responsibility
Full-text and vector search abstractions

## Position
Data Layer 1

## Components
- **ISearch**: Interface defining the layer contract.
- **Search**: Concrete implementation.
- **SearchEntity**: Core domain entity.
- **SearchValueObject**: Immutable value object.
- **SearchDomainService**: Domain logic.
- **SearchHealthCheck**: Health check with execution/success/time checks.
- **SearchPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **SearchError** / **SearchErrorMapper**: Error taxonomy and mapping.
