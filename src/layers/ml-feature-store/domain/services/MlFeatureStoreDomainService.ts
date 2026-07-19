/**
 * MlFeatureStore Domain Service
 */

import { MlFeatureStoreEntity } from '../entities/MlFeatureStoreEntity';

export class MlFeatureStoreDomainService {
  validate(entity: MlFeatureStoreEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: MlFeatureStoreEntity, other: MlFeatureStoreEntity): MlFeatureStoreEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
