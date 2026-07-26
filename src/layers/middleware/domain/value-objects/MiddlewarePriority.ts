/**
 * MiddlewarePriority Value Object
 *
 * Priority level for middleware tasks.
 */

export class MiddlewarePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): MiddlewarePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new MiddlewarePriority(value, label);
  }

  static low(): MiddlewarePriority {
    return new MiddlewarePriority(1, 'low');
  }
  static medium(): MiddlewarePriority {
    return new MiddlewarePriority(5, 'medium');
  }
  static high(): MiddlewarePriority {
    return new MiddlewarePriority(8, 'high');
  }
  static critical(): MiddlewarePriority {
    return new MiddlewarePriority(10, 'critical');
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

  isHigherThan(other: MiddlewarePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: MiddlewarePriority): boolean {
    return this.value < other.value;
  }

  equals(other: MiddlewarePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
