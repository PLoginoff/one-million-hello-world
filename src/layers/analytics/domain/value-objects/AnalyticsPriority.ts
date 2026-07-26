/**
 * AnalyticsPriority Value Object
 *
 * Priority level for analytics tasks.
 */

export class AnalyticsPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): AnalyticsPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new AnalyticsPriority(value, label);
  }

  static low(): AnalyticsPriority {
    return new AnalyticsPriority(1, 'low');
  }
  static medium(): AnalyticsPriority {
    return new AnalyticsPriority(5, 'medium');
  }
  static high(): AnalyticsPriority {
    return new AnalyticsPriority(8, 'high');
  }
  static critical(): AnalyticsPriority {
    return new AnalyticsPriority(10, 'critical');
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

  isHigherThan(other: AnalyticsPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: AnalyticsPriority): boolean {
    return this.value < other.value;
  }

  equals(other: AnalyticsPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
