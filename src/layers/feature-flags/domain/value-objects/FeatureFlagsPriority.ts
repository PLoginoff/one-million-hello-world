/**
 * FeatureFlagsPriority Value Object
 *
 * Priority level for feature-flags tasks.
 */

export class FeatureFlagsPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): FeatureFlagsPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new FeatureFlagsPriority(value, label);
  }

  static low(): FeatureFlagsPriority {
    return new FeatureFlagsPriority(1, 'low');
  }
  static medium(): FeatureFlagsPriority {
    return new FeatureFlagsPriority(5, 'medium');
  }
  static high(): FeatureFlagsPriority {
    return new FeatureFlagsPriority(8, 'high');
  }
  static critical(): FeatureFlagsPriority {
    return new FeatureFlagsPriority(10, 'critical');
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

  isHigherThan(other: FeatureFlagsPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: FeatureFlagsPriority): boolean {
    return this.value < other.value;
  }

  equals(other: FeatureFlagsPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
