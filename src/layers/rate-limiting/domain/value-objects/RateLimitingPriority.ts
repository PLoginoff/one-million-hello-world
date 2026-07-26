/**
 * RateLimitingPriority Value Object
 *
 * Priority level for rate-limiting tasks.
 */

export class RateLimitingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): RateLimitingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new RateLimitingPriority(value, label);
  }

  static low(): RateLimitingPriority {
    return new RateLimitingPriority(1, 'low');
  }
  static medium(): RateLimitingPriority {
    return new RateLimitingPriority(5, 'medium');
  }
  static high(): RateLimitingPriority {
    return new RateLimitingPriority(8, 'high');
  }
  static critical(): RateLimitingPriority {
    return new RateLimitingPriority(10, 'critical');
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

  isHigherThan(other: RateLimitingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: RateLimitingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: RateLimitingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
