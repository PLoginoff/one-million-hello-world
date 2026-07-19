# MultiTenancy Layer

## Responsibility
Multi-tenant context and isolation strategies

## Position
Product Layer 1

## Components
- **IMultiTenancy**: Interface defining the layer contract.
- **MultiTenancy**: Concrete implementation.
- **MultiTenancyEntity**: Core domain entity.
- **MultiTenancyValueObject**: Immutable value object.
- **MultiTenancyDomainService**: Domain logic.
- **MultiTenancyHealthCheck**: Health check with execution/success/time checks.
- **MultiTenancyPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **MultiTenancyError** / **MultiTenancyErrorMapper**: Error taxonomy and mapping.
