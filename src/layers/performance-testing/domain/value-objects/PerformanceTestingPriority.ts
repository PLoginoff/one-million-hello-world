/**
 * PerformanceTestingPriority Value Object
 *
 * Priority level for performance-testing tasks.
 */

export class PerformanceTestingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): PerformanceTestingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new PerformanceTestingPriority(value, label);
  }

  static low(): PerformanceTestingPriority {
    return new PerformanceTestingPriority(1, 'low');
  }
  static medium(): PerformanceTestingPriority {
    return new PerformanceTestingPriority(5, 'medium');
  }
  static high(): PerformanceTestingPriority {
    return new PerformanceTestingPriority(8, 'high');
  }
  static critical(): PerformanceTestingPriority {
    return new PerformanceTestingPriority(10, 'critical');
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

  isHigherThan(other: PerformanceTestingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: PerformanceTestingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: PerformanceTestingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
