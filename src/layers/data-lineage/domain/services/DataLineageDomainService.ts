/**
 * DataLineage Domain Service
 */

import { DataLineageEntity } from '../entities/DataLineageEntity';

export class DataLineageDomainService {
  validate(entity: DataLineageEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: DataLineageEntity, other: DataLineageEntity): DataLineageEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
