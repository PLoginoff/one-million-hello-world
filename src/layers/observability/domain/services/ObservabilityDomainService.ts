/**
 * Observability Domain Service
 *
 * Domain service for Metrics, logs and traces aggregation operations.
 */

export class ObservabilityDomainService {
  validate(data: Record<string, unknown>): boolean {
    return data !== null && typeof data === 'object';
  }

  enrich(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      enrichedBy: 'ObservabilityDomainService',
      enrichedAt: new Date().toISOString(),
    };
  }
}
