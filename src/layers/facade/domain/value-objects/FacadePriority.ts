/**
 * FacadePriority Value Object
 *
 * Priority level for facade tasks.
 */

export class FacadePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): FacadePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new FacadePriority(value, label);
  }

  static low(): FacadePriority {
    return new FacadePriority(1, 'low');
  }
  static medium(): FacadePriority {
    return new FacadePriority(5, 'medium');
  }
  static high(): FacadePriority {
    return new FacadePriority(8, 'high');
  }
  static critical(): FacadePriority {
    return new FacadePriority(10, 'critical');
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

  isHigherThan(other: FacadePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: FacadePriority): boolean {
    return this.value < other.value;
  }

  equals(other: FacadePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
