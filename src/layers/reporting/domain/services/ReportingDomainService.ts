/**
 * Reporting Domain Service
 */

import { ReportingEntity } from '../entities/ReportingEntity';

export class ReportingDomainService {
  validate(entity: ReportingEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: ReportingEntity, other: ReportingEntity): ReportingEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
