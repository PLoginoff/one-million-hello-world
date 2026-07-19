/**
 * Domain Metrics Collector
 *
 * Collects and exposes metrics for the domain layer.
 */

export interface DomainMetrics {
  domainEntitiesCreatedTotal: number;
  domainEntitiesUpdatedTotal: number;
  domainEntitiesDeletedTotal: number;
  domainEventsPublishedTotal: number;
  domainValidationFailuresTotal: number;
  collectedAt: number;
}

export interface DomainMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export class DomainMetricsCollector {
  private _metrics: DomainMetrics;
  private _collectionCount: number;

  constructor() {
    this._metrics = {
      domainEntitiesCreatedTotal: 0,
      domainEntitiesUpdatedTotal: 0,
      domainEntitiesDeletedTotal: 0,
      domainEventsPublishedTotal: 0,
      domainValidationFailuresTotal: 0,
      collectedAt: 0,
    };
    this._collectionCount = 0;
  }

  recordEntityCreated(): void {
    this._metrics.domainEntitiesCreatedTotal++;
  }

  recordEntityUpdated(): void {
    this._metrics.domainEntitiesUpdatedTotal++;
  }

  recordEntityDeleted(): void {
    this._metrics.domainEntitiesDeletedTotal++;
  }

  recordEventPublished(): void {
    this._metrics.domainEventsPublishedTotal++;
  }

  recordValidationFailure(): void {
    this._metrics.domainValidationFailuresTotal++;
  }

  collect(): DomainMetrics {
    this._collectionCount++;
    return { ...this._metrics, collectedAt: Date.now() };
  }

  collectAsPrometheusSamples(): DomainMetricSample[] {
    const m = this.collect();
    const ts = m.collectedAt;
    return [
      { name: 'domain_entities_created_total', value: m.domainEntitiesCreatedTotal, labels: {}, timestamp: ts },
      { name: 'domain_entities_updated_total', value: m.domainEntitiesUpdatedTotal, labels: {}, timestamp: ts },
      { name: 'domain_entities_deleted_total', value: m.domainEntitiesDeletedTotal, labels: {}, timestamp: ts },
      { name: 'domain_events_published_total', value: m.domainEventsPublishedTotal, labels: {}, timestamp: ts },
      { name: 'domain_validation_failures_total', value: m.domainValidationFailuresTotal, labels: {}, timestamp: ts },
    ];
  }

  toPrometheusString(): string {
    const samples = this.collectAsPrometheusSamples();
    const lines: string[] = [
      '# HELP domain_entities_created_total Total domain entities created',
      '# TYPE domain_entities_created_total counter',
      '# HELP domain_entities_updated_total Total domain entities updated',
      '# TYPE domain_entities_updated_total counter',
      '# HELP domain_entities_deleted_total Total domain entities deleted',
      '# TYPE domain_entities_deleted_total counter',
      '# HELP domain_events_published_total Total domain events published',
      '# TYPE domain_events_published_total counter',
      '# HELP domain_validation_failures_total Total domain validation failures',
      '# TYPE domain_validation_failures_total counter',
    ];

    for (const s of samples) {
      lines.push(`${s.name} ${s.value} ${s.timestamp}`);
    }

    return lines.join('\n') + '\n';
  }

  reset(): void {
    this._metrics = {
      domainEntitiesCreatedTotal: 0,
      domainEntitiesUpdatedTotal: 0,
      domainEntitiesDeletedTotal: 0,
      domainEventsPublishedTotal: 0,
      domainValidationFailuresTotal: 0,
      collectedAt: 0,
    };
  }

  getCollectionCount(): number {
    return this._collectionCount;
  }
}
