/**
 * DdosProtectionPriority Value Object
 *
 * Priority level for ddos-protection tasks.
 */

export class DdosProtectionPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DdosProtectionPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DdosProtectionPriority(value, label);
  }

  static low(): DdosProtectionPriority {
    return new DdosProtectionPriority(1, 'low');
  }
  static medium(): DdosProtectionPriority {
    return new DdosProtectionPriority(5, 'medium');
  }
  static high(): DdosProtectionPriority {
    return new DdosProtectionPriority(8, 'high');
  }
  static critical(): DdosProtectionPriority {
    return new DdosProtectionPriority(10, 'critical');
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

  isHigherThan(other: DdosProtectionPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DdosProtectionPriority): boolean {
    return this.value < other.value;
  }

  equals(other: DdosProtectionPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
