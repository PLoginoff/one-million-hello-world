/**
 * WafPriority Value Object
 *
 * Priority level for waf tasks.
 */

export class WafPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): WafPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new WafPriority(value, label);
  }

  static low(): WafPriority {
    return new WafPriority(1, 'low');
  }
  static medium(): WafPriority {
    return new WafPriority(5, 'medium');
  }
  static high(): WafPriority {
    return new WafPriority(8, 'high');
  }
  static critical(): WafPriority {
    return new WafPriority(10, 'critical');
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

  isHigherThan(other: WafPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: WafPriority): boolean {
    return this.value < other.value;
  }

  equals(other: WafPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
