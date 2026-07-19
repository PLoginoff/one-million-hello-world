/**
 * SecretsRotation Domain Service
 */

import { SecretsRotationEntity } from '../entities/SecretsRotationEntity';

export class SecretsRotationDomainService {
  validate(entity: SecretsRotationEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: SecretsRotationEntity, other: SecretsRotationEntity): SecretsRotationEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
