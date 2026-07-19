# Reporting Layer

## Responsibility
Report generation and export in multiple formats

## Position
Data Layer 2

## Components
- **IReporting**: Interface defining the layer contract.
- **Reporting**: Concrete implementation.
- **ReportingEntity**: Core domain entity.
- **ReportingValueObject**: Immutable value object.
- **ReportingDomainService**: Domain logic.
- **ReportingHealthCheck**: Health check with execution/success/time checks.
- **ReportingPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **ReportingError** / **ReportingErrorMapper**: Error taxonomy and mapping.
