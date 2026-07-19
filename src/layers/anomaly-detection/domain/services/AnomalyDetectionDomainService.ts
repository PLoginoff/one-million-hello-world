/**
 * AnomalyDetection Domain Service
 */

import { AnomalyDetectionEntity } from '../entities/AnomalyDetectionEntity';

export class AnomalyDetectionDomainService {
  validate(entity: AnomalyDetectionEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: AnomalyDetectionEntity, other: AnomalyDetectionEntity): AnomalyDetectionEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
