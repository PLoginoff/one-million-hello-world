# Scheduling Layer

## Responsibility
Cron-based and event-driven job scheduling

## Position
Infra Layer 3

## Components
- **IScheduling**: Interface defining the layer contract.
- **Scheduling**: Concrete implementation.
- **SchedulingEntity**: Core domain entity.
- **SchedulingValueObject**: Immutable value object.
- **SchedulingDomainService**: Domain logic.
- **SchedulingHealthCheck**: Health check with execution/success/time checks.
- **SchedulingPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **SchedulingError** / **SchedulingErrorMapper**: Error taxonomy and mapping.
