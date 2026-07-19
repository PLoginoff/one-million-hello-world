# AnomalyDetection Layer

## Responsibility
Anomaly detection with statistical and ML methods

## Position
ML Layer 3

## Components
- **IAnomalyDetection**: Interface defining the layer contract.
- **AnomalyDetection**: Concrete implementation.
- **AnomalyDetectionEntity**: Core domain entity.
- **AnomalyDetectionValueObject**: Immutable value object.
- **AnomalyDetectionDomainService**: Domain logic.
- **AnomalyDetectionHealthCheck**: Health check with execution/success/time checks.
- **AnomalyDetectionPrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **AnomalyDetectionError** / **AnomalyDetectionErrorMapper**: Error taxonomy and mapping.
