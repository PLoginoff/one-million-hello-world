/**
 * CostOptimization Domain Service
 */

import { CostOptimizationEntity } from '../entities/CostOptimizationEntity';

export class CostOptimizationDomainService {
  validate(entity: CostOptimizationEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: CostOptimizationEntity, other: CostOptimizationEntity): CostOptimizationEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
