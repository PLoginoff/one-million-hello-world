# ApiVersioning Layer

## Responsibility
API version negotiation and deprecation management

## Position
Infra Layer 1

## Components
- **IApiVersioning**: Interface defining the layer contract.
- **ApiVersioning**: Concrete implementation.
- **ApiVersioningEntity**: Core domain entity.
- **ApiVersioningValueObject**: Immutable value object.
- **ApiVersioningDomainService**: Domain logic.
- **ApiVersioningHealthCheck**: Health check with execution/success/time checks.
- **ApiVersioningPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **ApiVersioningError** / **ApiVersioningErrorMapper**: Error taxonomy and mapping.
