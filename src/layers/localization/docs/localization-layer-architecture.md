# Localization Layer

## Responsibility
Internationalization and locale management

## Position
Infra Layer 2

## Components
- **ILocalization**: Interface defining the layer contract.
- **Localization**: Concrete implementation.
- **LocalizationEntity**: Core domain entity.
- **LocalizationValueObject**: Immutable value object.
- **LocalizationDomainService**: Domain logic.
- **LocalizationHealthCheck**: Health check with execution/success/time checks.
- **LocalizationPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **LocalizationError** / **LocalizationErrorMapper**: Error taxonomy and mapping.
