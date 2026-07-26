/**
 * OnboardingPriority Value Object
 *
 * Priority level for onboarding tasks.
 */

export class OnboardingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): OnboardingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new OnboardingPriority(value, label);
  }

  static low(): OnboardingPriority {
    return new OnboardingPriority(1, 'low');
  }
  static medium(): OnboardingPriority {
    return new OnboardingPriority(5, 'medium');
  }
  static high(): OnboardingPriority {
    return new OnboardingPriority(8, 'high');
  }
  static critical(): OnboardingPriority {
    return new OnboardingPriority(10, 'critical');
  }

  isLow(): boolean {
    return this.value <= 2;
  }
  isMedium(): boolean {
    return this.value > 2 && this.value <= 5;
  }
  isHigh(): boolean {
    return this.value > 5 && this.value <= 8;
  }
  isCritical(): boolean {
    return this.value > 8;
  }

  isHigherThan(other: OnboardingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: OnboardingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: OnboardingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
