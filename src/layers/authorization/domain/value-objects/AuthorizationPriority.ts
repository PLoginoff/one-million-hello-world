/**
 * AuthorizationPriority Value Object
 *
 * Priority level for authorization tasks.
 */

export class AuthorizationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): AuthorizationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new AuthorizationPriority(value, label);
  }

  static low(): AuthorizationPriority {
    return new AuthorizationPriority(1, 'low');
  }
  static medium(): AuthorizationPriority {
    return new AuthorizationPriority(5, 'medium');
  }
  static high(): AuthorizationPriority {
    return new AuthorizationPriority(8, 'high');
  }
  static critical(): AuthorizationPriority {
    return new AuthorizationPriority(10, 'critical');
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

  isHigherThan(other: AuthorizationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: AuthorizationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: AuthorizationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
