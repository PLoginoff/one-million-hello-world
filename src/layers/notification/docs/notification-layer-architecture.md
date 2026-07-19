# Notification Layer

## Responsibility
Email, SMS, and push notification abstractions

## Position
Product Layer 2

## Components
- **INotification**: Interface defining the layer contract.
- **Notification**: Concrete implementation.
- **NotificationEntity**: Core domain entity.
- **NotificationValueObject**: Immutable value object.
- **NotificationDomainService**: Domain logic.
- **NotificationHealthCheck**: Health check with execution/success/time checks.
- **NotificationPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **NotificationError** / **NotificationErrorMapper**: Error taxonomy and mapping.
