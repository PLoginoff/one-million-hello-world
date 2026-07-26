/**
 * ReportingPriority Value Object
 *
 * Priority level for reporting tasks.
 */

export class ReportingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ReportingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ReportingPriority(value, label);
  }

  static low(): ReportingPriority {
    return new ReportingPriority(1, 'low');
  }
  static medium(): ReportingPriority {
    return new ReportingPriority(5, 'medium');
  }
  static high(): ReportingPriority {
    return new ReportingPriority(8, 'high');
  }
  static critical(): ReportingPriority {
    return new ReportingPriority(10, 'critical');
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

  isHigherThan(other: ReportingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ReportingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ReportingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
