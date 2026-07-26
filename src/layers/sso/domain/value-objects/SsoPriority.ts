/**
 * SsoPriority Value Object
 *
 * Priority level for sso tasks.
 */

export class SsoPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SsoPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SsoPriority(value, label);
  }

  static low(): SsoPriority {
    return new SsoPriority(1, 'low');
  }
  static medium(): SsoPriority {
    return new SsoPriority(5, 'medium');
  }
  static high(): SsoPriority {
    return new SsoPriority(8, 'high');
  }
  static critical(): SsoPriority {
    return new SsoPriority(10, 'critical');
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

  isHigherThan(other: SsoPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SsoPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SsoPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
