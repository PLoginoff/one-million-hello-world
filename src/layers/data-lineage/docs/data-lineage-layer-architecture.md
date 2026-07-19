# DataLineage Layer

## Responsibility
Data flow tracking and lineage graph

## Position
Data Layer 3

## Components
- **IDataLineage**: Interface defining the layer contract.
- **DataLineage**: Concrete implementation.
- **DataLineageEntity**: Core domain entity.
- **DataLineageValueObject**: Immutable value object.
- **DataLineageDomainService**: Domain logic.
- **DataLineageHealthCheck**: Health check with execution/success/time checks.
- **DataLineagePrometheusMetricsCollector**: Prometheus-compatible metrics export.
- **DataLineageError** / **DataLineageErrorMapper**: Error taxonomy and mapping.
