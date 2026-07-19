# Billing Layer

## Responsibility
Usage metering, plan limits, and invoicing

## Position
Product Layer 3

## Components
- **IBilling**: Interface defining the layer contract.
- **Billing**: Concrete implementation.
- **BillingEntity**: Core domain entity.
- **BillingValueObject**: Immutable value object.
- **BillingDomainService**: Domain logic.
- **BillingHealthCheck**: Health check with execution/success/time checks.
- **BillingPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **BillingError** / **BillingErrorMapper**: Error taxonomy and mapping.
