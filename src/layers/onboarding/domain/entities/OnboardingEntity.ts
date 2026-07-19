/**
 * Onboarding Entity
 */

export interface OnboardingEntityData {
  id: string;
  name: string;
  attributes: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class OnboardingEntity {
  readonly data: OnboardingEntityData;

  private constructor(data: OnboardingEntityData) {
    this.data = { ...data };
  }

  static create(name: string, attributes: Record<string, unknown> = {}): OnboardingEntity {
    const now = Date.now();
    return new OnboardingEntity({
      id: 'onboarding-' + now + '-' + Math.random().toString(36).slice(2, 8),
      name,
      attributes,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateAttributes(attrs: Record<string, unknown>): OnboardingEntity {
    return new OnboardingEntity({
      ...this.data,
      attributes: { ...this.data.attributes, ...attrs },
      updatedAt: Date.now(),
    });
  }

  toObject(): OnboardingEntityData {
    return { ...this.data, attributes: { ...this.data.attributes } };
  }
}
