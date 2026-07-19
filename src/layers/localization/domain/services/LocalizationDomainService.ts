/**
 * Localization Domain Service
 */

import { LocalizationEntity } from '../entities/LocalizationEntity';

export class LocalizationDomainService {
  validate(entity: LocalizationEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: LocalizationEntity, other: LocalizationEntity): LocalizationEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
