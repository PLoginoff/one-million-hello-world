/**
 * Onboarding Value Object
 */

export class OnboardingValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): OnboardingValueObject {
    return new OnboardingValueObject(value, type);
  }

  equals(other: OnboardingValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
