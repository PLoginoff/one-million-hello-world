# CdnIntegration Layer

## Responsibility
CDN purge, invalidation, and cache management

## Position
Infra Layer 5

## Components
- **ICdnIntegration**: Interface defining the layer contract.
- **CdnIntegration**: Concrete implementation.
- **CdnIntegrationEntity**: Core domain entity.
- **CdnIntegrationValueObject**: Immutable value object.
- **CdnIntegrationDomainService**: Domain logic.
- **CdnIntegrationHealthCheck**: Health check with execution/success/time checks.
- **CdnIntegrationPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **CdnIntegrationError** / **CdnIntegrationErrorMapper**: Error taxonomy and mapping.
