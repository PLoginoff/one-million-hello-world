/**
 * SecurityPriority Value Object
 *
 * Priority level for security tasks.
 */

export class SecurityPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SecurityPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SecurityPriority(value, label);
  }

  static low(): SecurityPriority {
    return new SecurityPriority(1, 'low');
  }
  static medium(): SecurityPriority {
    return new SecurityPriority(5, 'medium');
  }
  static high(): SecurityPriority {
    return new SecurityPriority(8, 'high');
  }
  static critical(): SecurityPriority {
    return new SecurityPriority(10, 'critical');
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

  isHigherThan(other: SecurityPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SecurityPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SecurityPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
