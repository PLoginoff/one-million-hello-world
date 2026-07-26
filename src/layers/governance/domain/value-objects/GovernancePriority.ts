/**
 * GovernancePriority Value Object
 *
 * Priority level for governance tasks.
 */

export class GovernancePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): GovernancePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new GovernancePriority(value, label);
  }

  static low(): GovernancePriority {
    return new GovernancePriority(1, 'low');
  }
  static medium(): GovernancePriority {
    return new GovernancePriority(5, 'medium');
  }
  static high(): GovernancePriority {
    return new GovernancePriority(8, 'high');
  }
  static critical(): GovernancePriority {
    return new GovernancePriority(10, 'critical');
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

  isHigherThan(other: GovernancePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: GovernancePriority): boolean {
    return this.value < other.value;
  }

  equals(other: GovernancePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
