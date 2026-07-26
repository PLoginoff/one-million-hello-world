/**
 * SpecificationPriority Value Object
 *
 * Priority level for specification tasks.
 */

export class SpecificationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SpecificationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SpecificationPriority(value, label);
  }

  static low(): SpecificationPriority {
    return new SpecificationPriority(1, 'low');
  }
  static medium(): SpecificationPriority {
    return new SpecificationPriority(5, 'medium');
  }
  static high(): SpecificationPriority {
    return new SpecificationPriority(8, 'high');
  }
  static critical(): SpecificationPriority {
    return new SpecificationPriority(10, 'critical');
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

  isHigherThan(other: SpecificationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SpecificationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SpecificationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
