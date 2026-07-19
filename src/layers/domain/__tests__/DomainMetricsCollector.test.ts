/**
 * Domain Metrics Collector Unit Tests
 */

import { DomainMetricsCollector } from '../metrics/DomainMetricsCollector';

describe('DomainMetricsCollector', () => {
  let collector: DomainMetricsCollector;

  beforeEach(() => {
    collector = new DomainMetricsCollector();
  });

  it('should record entity created', () => {
    collector.recordEntityCreated();
    collector.recordEntityCreated();
    const metrics = collector.collect();
    expect(metrics.domainEntitiesCreatedTotal).toBe(2);
  });

  it('should record entity updated', () => {
    collector.recordEntityUpdated();
    const metrics = collector.collect();
    expect(metrics.domainEntitiesUpdatedTotal).toBe(1);
  });

  it('should record entity deleted', () => {
    collector.recordEntityDeleted();
    const metrics = collector.collect();
    expect(metrics.domainEntitiesDeletedTotal).toBe(1);
  });

  it('should record event published', () => {
    collector.recordEventPublished();
    collector.recordEventPublished();
    collector.recordEventPublished();
    const metrics = collector.collect();
    expect(metrics.domainEventsPublishedTotal).toBe(3);
  });

  it('should record validation failure', () => {
    collector.recordValidationFailure();
    const metrics = collector.collect();
    expect(metrics.domainValidationFailuresTotal).toBe(1);
  });

  it('should increment collection count', () => {
    collector.collect();
    collector.collect();
    expect(collector.getCollectionCount()).toBe(2);
  });

  it('should produce Prometheus samples', () => {
    collector.recordEntityCreated();
    const samples = collector.collectAsPrometheusSamples();
    const names = samples.map((s) => s.name);
    expect(names).toContain('domain_entities_created_total');
    expect(names).toContain('domain_events_published_total');
  });

  it('should generate Prometheus text', () => {
    collector.recordEntityCreated();
    const text = collector.toPrometheusString();
    expect(text).toContain('# HELP domain_entities_created_total');
    expect(text).toContain('# TYPE domain_entities_created_total counter');
  });

  it('should reset metrics', () => {
    collector.recordEntityCreated();
    collector.reset();
    const metrics = collector.collect();
    expect(metrics.domainEntitiesCreatedTotal).toBe(0);
  });
});
