/**
 * PropertyTestingPriority Value Object
 *
 * Priority level for property-testing tasks.
 */

export class PropertyTestingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): PropertyTestingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new PropertyTestingPriority(value, label);
  }

  static low(): PropertyTestingPriority {
    return new PropertyTestingPriority(1, 'low');
  }
  static medium(): PropertyTestingPriority {
    return new PropertyTestingPriority(5, 'medium');
  }
  static high(): PropertyTestingPriority {
    return new PropertyTestingPriority(8, 'high');
  }
  static critical(): PropertyTestingPriority {
    return new PropertyTestingPriority(10, 'critical');
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

  isHigherThan(other: PropertyTestingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: PropertyTestingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: PropertyTestingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
