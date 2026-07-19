/**
 * Scheduling Domain Service
 */

import { SchedulingEntity } from '../entities/SchedulingEntity';

export class SchedulingDomainService {
  validate(entity: SchedulingEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: SchedulingEntity, other: SchedulingEntity): SchedulingEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
