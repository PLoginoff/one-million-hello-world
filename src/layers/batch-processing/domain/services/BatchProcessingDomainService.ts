/**
 * BatchProcessing Domain Service
 */

import { BatchProcessingEntity } from '../entities/BatchProcessingEntity';

export class BatchProcessingDomainService {
  validate(entity: BatchProcessingEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: BatchProcessingEntity, other: BatchProcessingEntity): BatchProcessingEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
