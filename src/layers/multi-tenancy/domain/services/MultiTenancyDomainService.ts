/**
 * MultiTenancy Domain Service
 */

import { MultiTenancyEntity } from '../entities/MultiTenancyEntity';

export class MultiTenancyDomainService {
  validate(entity: MultiTenancyEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: MultiTenancyEntity, other: MultiTenancyEntity): MultiTenancyEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
