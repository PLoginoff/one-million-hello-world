/**
 * RulesEnginePriority Value Object
 *
 * Priority level for rules-engine tasks.
 */

export class RulesEnginePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): RulesEnginePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new RulesEnginePriority(value, label);
  }

  static low(): RulesEnginePriority {
    return new RulesEnginePriority(1, 'low');
  }
  static medium(): RulesEnginePriority {
    return new RulesEnginePriority(5, 'medium');
  }
  static high(): RulesEnginePriority {
    return new RulesEnginePriority(8, 'high');
  }
  static critical(): RulesEnginePriority {
    return new RulesEnginePriority(10, 'critical');
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

  isHigherThan(other: RulesEnginePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: RulesEnginePriority): boolean {
    return this.value < other.value;
  }

  equals(other: RulesEnginePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
