/**
 * MlFeatureStorePriority Value Object
 *
 * Priority level for ml-feature-store tasks.
 */

export class MlFeatureStorePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): MlFeatureStorePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new MlFeatureStorePriority(value, label);
  }

  static low(): MlFeatureStorePriority {
    return new MlFeatureStorePriority(1, 'low');
  }
  static medium(): MlFeatureStorePriority {
    return new MlFeatureStorePriority(5, 'medium');
  }
  static high(): MlFeatureStorePriority {
    return new MlFeatureStorePriority(8, 'high');
  }
  static critical(): MlFeatureStorePriority {
    return new MlFeatureStorePriority(10, 'critical');
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

  isHigherThan(other: MlFeatureStorePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: MlFeatureStorePriority): boolean {
    return this.value < other.value;
  }

  equals(other: MlFeatureStorePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
