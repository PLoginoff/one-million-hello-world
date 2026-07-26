/**
 * BillingPriority Value Object
 *
 * Priority level for billing tasks.
 */

export class BillingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): BillingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new BillingPriority(value, label);
  }

  static low(): BillingPriority {
    return new BillingPriority(1, 'low');
  }
  static medium(): BillingPriority {
    return new BillingPriority(5, 'medium');
  }
  static high(): BillingPriority {
    return new BillingPriority(8, 'high');
  }
  static critical(): BillingPriority {
    return new BillingPriority(10, 'critical');
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

  isHigherThan(other: BillingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: BillingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: BillingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
