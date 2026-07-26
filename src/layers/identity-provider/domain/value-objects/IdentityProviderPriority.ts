/**
 * IdentityProviderPriority Value Object
 *
 * Priority level for identity-provider tasks.
 */

export class IdentityProviderPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): IdentityProviderPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new IdentityProviderPriority(value, label);
  }

  static low(): IdentityProviderPriority {
    return new IdentityProviderPriority(1, 'low');
  }
  static medium(): IdentityProviderPriority {
    return new IdentityProviderPriority(5, 'medium');
  }
  static high(): IdentityProviderPriority {
    return new IdentityProviderPriority(8, 'high');
  }
  static critical(): IdentityProviderPriority {
    return new IdentityProviderPriority(10, 'critical');
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

  isHigherThan(other: IdentityProviderPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: IdentityProviderPriority): boolean {
    return this.value < other.value;
  }

  equals(other: IdentityProviderPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
