/**
 * ApiVersioning Domain Service
 */

import { ApiVersioningEntity } from '../entities/ApiVersioningEntity';

export class ApiVersioningDomainService {
  validate(entity: ApiVersioningEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: ApiVersioningEntity, other: ApiVersioningEntity): ApiVersioningEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
