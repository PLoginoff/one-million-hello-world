/**
 * Notification Domain Service
 */

import { NotificationEntity } from '../entities/NotificationEntity';

export class NotificationDomainService {
  validate(entity: NotificationEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: NotificationEntity, other: NotificationEntity): NotificationEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
