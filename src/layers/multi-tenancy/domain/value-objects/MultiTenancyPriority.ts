/**
 * MultiTenancyPriority Value Object
 *
 * Priority level for multi-tenancy tasks.
 */

export class MultiTenancyPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): MultiTenancyPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new MultiTenancyPriority(value, label);
  }

  static low(): MultiTenancyPriority {
    return new MultiTenancyPriority(1, 'low');
  }
  static medium(): MultiTenancyPriority {
    return new MultiTenancyPriority(5, 'medium');
  }
  static high(): MultiTenancyPriority {
    return new MultiTenancyPriority(8, 'high');
  }
  static critical(): MultiTenancyPriority {
    return new MultiTenancyPriority(10, 'critical');
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

  isHigherThan(other: MultiTenancyPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: MultiTenancyPriority): boolean {
    return this.value < other.value;
  }

  equals(other: MultiTenancyPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
