/**
 * DeadLetterPriority Value Object
 *
 * Priority level for dead-letter tasks.
 */

export class DeadLetterPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DeadLetterPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DeadLetterPriority(value, label);
  }

  static low(): DeadLetterPriority {
    return new DeadLetterPriority(1, 'low');
  }
  static medium(): DeadLetterPriority {
    return new DeadLetterPriority(5, 'medium');
  }
  static high(): DeadLetterPriority {
    return new DeadLetterPriority(8, 'high');
  }
  static critical(): DeadLetterPriority {
    return new DeadLetterPriority(10, 'critical');
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

  isHigherThan(other: DeadLetterPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DeadLetterPriority): boolean {
    return this.value < other.value;
  }

  equals(other: DeadLetterPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
