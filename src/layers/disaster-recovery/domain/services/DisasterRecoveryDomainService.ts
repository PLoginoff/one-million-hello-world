/**
 * DisasterRecovery Domain Service
 */

import { DisasterRecoveryEntity } from '../entities/DisasterRecoveryEntity';

export class DisasterRecoveryDomainService {
  validate(entity: DisasterRecoveryEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: DisasterRecoveryEntity, other: DisasterRecoveryEntity): DisasterRecoveryEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
