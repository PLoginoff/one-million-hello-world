/**
 * Bpmn Domain Service
 *
 * Domain service for BPMN process execution operations.
 */

export class BpmnDomainService {
  validate(data: Record<string, unknown>): boolean {
    return data !== null && typeof data === 'object';
  }

  enrich(data: Record<string, unknown>): Record<string, unknown> {
    return {
      ...data,
      enrichedBy: 'BpmnDomainService',
      enrichedAt: new Date().toISOString(),
    };
  }
}
