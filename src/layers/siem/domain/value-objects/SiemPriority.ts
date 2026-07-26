/**
 * SiemPriority Value Object
 *
 * Priority level for siem tasks.
 */

export class SiemPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SiemPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SiemPriority(value, label);
  }

  static low(): SiemPriority {
    return new SiemPriority(1, 'low');
  }
  static medium(): SiemPriority {
    return new SiemPriority(5, 'medium');
  }
  static high(): SiemPriority {
    return new SiemPriority(8, 'high');
  }
  static critical(): SiemPriority {
    return new SiemPriority(10, 'critical');
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

  isHigherThan(other: SiemPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SiemPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SiemPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
