/**
 * Recommendation Domain Service
 */

import { RecommendationEntity } from '../entities/RecommendationEntity';

export class RecommendationDomainService {
  validate(entity: RecommendationEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: RecommendationEntity, other: RecommendationEntity): RecommendationEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
