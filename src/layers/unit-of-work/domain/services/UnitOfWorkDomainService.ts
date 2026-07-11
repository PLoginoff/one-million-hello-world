/**
 * UnitOfWork Domain Service
 *
 * Domain service for Unit of work pattern operations.
 */

export class UnitOfWorkDomainService {
  validate(data: Record<string, unknown>): boolean {
    return data !== null && typeof data === 'object';
  }

  enrich(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      enrichedBy: 'UnitOfWorkDomainService',
      enrichedAt: new Date().toISOString(),
    };
  }
}
