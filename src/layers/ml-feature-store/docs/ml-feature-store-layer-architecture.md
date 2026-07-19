# MlFeatureStore Layer

## Responsibility
ML feature storage, serving, and versioning

## Position
ML Layer 2

## Components
- **IMlFeatureStore**: Interface defining the layer contract.
- **MlFeatureStore**: Concrete implementation.
- **MlFeatureStoreEntity**: Core domain entity.
- **MlFeatureStoreValueObject**: Immutable value object.
- **MlFeatureStoreDomainService**: Domain logic.
- **MlFeatureStoreHealthCheck**: Health check with execution/success/time checks.
- **MlFeatureStorePrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **MlFeatureStoreError** / **MlFeatureStoreErrorMapper**: Error taxonomy and mapping.
