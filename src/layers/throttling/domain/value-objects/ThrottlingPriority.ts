/**
 * ThrottlingPriority Value Object
 *
 * Priority level for throttling tasks.
 */

export class ThrottlingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ThrottlingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ThrottlingPriority(value, label);
  }

  static low(): ThrottlingPriority {
    return new ThrottlingPriority(1, 'low');
  }
  static medium(): ThrottlingPriority {
    return new ThrottlingPriority(5, 'medium');
  }
  static high(): ThrottlingPriority {
    return new ThrottlingPriority(8, 'high');
  }
  static critical(): ThrottlingPriority {
    return new ThrottlingPriority(10, 'critical');
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

  isHigherThan(other: ThrottlingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ThrottlingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ThrottlingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
