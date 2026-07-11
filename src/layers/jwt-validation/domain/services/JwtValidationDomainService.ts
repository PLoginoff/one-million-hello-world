/**
 * JwtValidation Domain Service
 *
 * Domain service for JWT token validation operations.
 */

export class JwtValidationDomainService {
  validate(data: Record<string, unknown>): boolean {
    return data !== null && typeof data === 'object';
  }

  enrich(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      enrichedBy: 'JwtValidationDomainService',
      enrichedAt: new Date().toISOString(),
    };
  }
}
