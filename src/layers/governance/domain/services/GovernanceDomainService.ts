/**
 * Governance Domain Service
 */

import { GovernanceEntity } from '../entities/GovernanceEntity';

export class GovernanceDomainService {
  validate(entity: GovernanceEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: GovernanceEntity, other: GovernanceEntity): GovernanceEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
