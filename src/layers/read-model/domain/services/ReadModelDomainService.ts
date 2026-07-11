/**
 * ReadModel Domain Service
 *
 * Domain service for Read model projections operations.
 */

export class ReadModelDomainService {
  validate(data: Record<string, unknown>): boolean {
    return data !== null && typeof data === 'object';
  }

  enrich(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      enrichedBy: 'ReadModelDomainService',
      enrichedAt: new Date().toISOString(),
    };
  }
}
