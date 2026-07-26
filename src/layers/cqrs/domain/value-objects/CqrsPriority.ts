/**
 * CqrsPriority Value Object
 *
 * Priority level for cqrs tasks.
 */

export class CqrsPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): CqrsPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new CqrsPriority(value, label);
  }

  static low(): CqrsPriority {
    return new CqrsPriority(1, 'low');
  }
  static medium(): CqrsPriority {
    return new CqrsPriority(5, 'medium');
  }
  static high(): CqrsPriority {
    return new CqrsPriority(8, 'high');
  }
  static critical(): CqrsPriority {
    return new CqrsPriority(10, 'critical');
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

  isHigherThan(other: CqrsPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: CqrsPriority): boolean {
    return this.value < other.value;
  }

  equals(other: CqrsPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
