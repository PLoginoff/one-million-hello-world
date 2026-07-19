# DisasterRecovery Layer

## Responsibility
DR drills, failover, and recovery orchestration

## Position
Infra Layer 8

## Components
- **IDisasterRecovery**: Interface defining the layer contract.
- **DisasterRecovery**: Concrete implementation.
- **DisasterRecoveryEntity**: Core domain entity.
- **DisasterRecoveryValueObject**: Immutable value object.
- **DisasterRecoveryDomainService**: Domain logic.
- **DisasterRecoveryHealthCheck**: Health check with execution/success/time checks.
- **DisasterRecoveryPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **DisasterRecoveryError** / **DisasterRecoveryErrorMapper**: Error taxonomy and mapping.
