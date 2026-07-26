/**
 * CachePriority Value Object
 *
 * Priority level for cache tasks.
 */

export class CachePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): CachePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new CachePriority(value, label);
  }

  static low(): CachePriority {
    return new CachePriority(1, 'low');
  }
  static medium(): CachePriority {
    return new CachePriority(5, 'medium');
  }
  static high(): CachePriority {
    return new CachePriority(8, 'high');
  }
  static critical(): CachePriority {
    return new CachePriority(10, 'critical');
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

  isHigherThan(other: CachePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: CachePriority): boolean {
    return this.value < other.value;
  }

  equals(other: CachePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
