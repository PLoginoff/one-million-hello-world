/**
 * SecretsPriority Value Object
 *
 * Priority level for secrets tasks.
 */

export class SecretsPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SecretsPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SecretsPriority(value, label);
  }

  static low(): SecretsPriority {
    return new SecretsPriority(1, 'low');
  }
  static medium(): SecretsPriority {
    return new SecretsPriority(5, 'medium');
  }
  static high(): SecretsPriority {
    return new SecretsPriority(8, 'high');
  }
  static critical(): SecretsPriority {
    return new SecretsPriority(10, 'critical');
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

  isHigherThan(other: SecretsPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SecretsPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SecretsPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
