/**
 * Search Domain Service
 */

import { SearchEntity } from '../entities/SearchEntity';

export class SearchDomainService {
  validate(entity: SearchEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: SearchEntity, other: SearchEntity): SearchEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
