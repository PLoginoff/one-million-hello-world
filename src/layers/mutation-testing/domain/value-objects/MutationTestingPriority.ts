/**
 * MutationTestingPriority Value Object
 *
 * Priority level for mutation-testing tasks.
 */

export class MutationTestingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): MutationTestingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new MutationTestingPriority(value, label);
  }

  static low(): MutationTestingPriority {
    return new MutationTestingPriority(1, 'low');
  }
  static medium(): MutationTestingPriority {
    return new MutationTestingPriority(5, 'medium');
  }
  static high(): MutationTestingPriority {
    return new MutationTestingPriority(8, 'high');
  }
  static critical(): MutationTestingPriority {
    return new MutationTestingPriority(10, 'critical');
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

  isHigherThan(other: MutationTestingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: MutationTestingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: MutationTestingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
