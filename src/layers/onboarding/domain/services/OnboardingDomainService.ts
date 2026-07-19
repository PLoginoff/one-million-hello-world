/**
 * Onboarding Domain Service
 */

import { OnboardingEntity } from '../entities/OnboardingEntity';

export class OnboardingDomainService {
  validate(entity: OnboardingEntity): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!entity.data.name || entity.data.name.trim().length === 0) {
      errors.push('Name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  merge(base: OnboardingEntity, other: OnboardingEntity): OnboardingEntity {
    return base.updateAttributes(other.data.attributes);
  }
}
