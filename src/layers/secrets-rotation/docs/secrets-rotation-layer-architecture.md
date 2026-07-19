# SecretsRotation Layer

## Responsibility
Automated secret rotation and lifecycle management

## Position
Infra Layer 6

## Components
- **ISecretsRotation**: Interface defining the layer contract.
- **SecretsRotation**: Concrete implementation.
- **SecretsRotationEntity**: Core domain entity.
- **SecretsRotationValueObject**: Immutable value object.
- **SecretsRotationDomainService**: Domain logic.
- **SecretsRotationHealthCheck**: Health check with execution/success/time checks.
- **SecretsRotationPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **SecretsRotationError** / **SecretsRotationErrorMapper**: Error taxonomy and mapping.
