/**
 * Outbox Domain Service
 *
 * Domain service for Transactional outbox pattern operations.
 */

export class OutboxDomainService {
  validate(data: Record<string, unknown>): boolean {
    return data !== null && typeof data === 'object';
  }

  enrich(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      enrichedBy: 'OutboxDomainService',
      enrichedAt: new Date().toISOString(),
    };
  }
}
