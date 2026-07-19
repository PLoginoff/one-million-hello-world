/**
 * CdnIntegration Domain Service
 */

import { CdnIntegrationEntity } from '../entities/CdnIntegrationEntity';

export class CdnIntegrationDomainService {
  validate(entity: CdnIntegrationEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: CdnIntegrationEntity, other: CdnIntegrationEntity): CdnIntegrationEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
