/**
 * Billing Domain Service
 */

import { BillingEntity } from '../entities/BillingEntity';

export class BillingDomainService {
  validate(entity: BillingEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: BillingEntity, other: BillingEntity): BillingEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
