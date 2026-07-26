/**
 * StrategyPriority Value Object
 *
 * Priority level for strategy tasks.
 */

export class StrategyPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): StrategyPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new StrategyPriority(value, label);
  }

  static low(): StrategyPriority {
    return new StrategyPriority(1, 'low');
  }
  static medium(): StrategyPriority {
    return new StrategyPriority(5, 'medium');
  }
  static high(): StrategyPriority {
    return new StrategyPriority(8, 'high');
  }
  static critical(): StrategyPriority {
    return new StrategyPriority(10, 'critical');
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

  isHigherThan(other: StrategyPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: StrategyPriority): boolean {
    return this.value < other.value;
  }

  equals(other: StrategyPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
