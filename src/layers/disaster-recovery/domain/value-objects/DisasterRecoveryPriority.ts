/**
 * DisasterRecoveryPriority Value Object
 *
 * Priority level for disaster-recovery tasks.
 */

export class DisasterRecoveryPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DisasterRecoveryPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DisasterRecoveryPriority(value, label);
  }

  static low(): DisasterRecoveryPriority {
    return new DisasterRecoveryPriority(1, 'low');
  }
  static medium(): DisasterRecoveryPriority {
    return new DisasterRecoveryPriority(5, 'medium');
  }
  static high(): DisasterRecoveryPriority {
    return new DisasterRecoveryPriority(8, 'high');
  }
  static critical(): DisasterRecoveryPriority {
    return new DisasterRecoveryPriority(10, 'critical');
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

  isHigherThan(other: DisasterRecoveryPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DisasterRecoveryPriority): boolean {
    return this.value < other.value;
  }

  equals(other: DisasterRecoveryPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
