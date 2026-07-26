/**
 * EdgeCachePriority Value Object
 *
 * Priority level for edge-cache tasks.
 */

export class EdgeCachePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): EdgeCachePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new EdgeCachePriority(value, label);
  }

  static low(): EdgeCachePriority {
    return new EdgeCachePriority(1, 'low');
  }
  static medium(): EdgeCachePriority {
    return new EdgeCachePriority(5, 'medium');
  }
  static high(): EdgeCachePriority {
    return new EdgeCachePriority(8, 'high');
  }
  static critical(): EdgeCachePriority {
    return new EdgeCachePriority(10, 'critical');
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

  isHigherThan(other: EdgeCachePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: EdgeCachePriority): boolean {
    return this.value < other.value;
  }

  equals(other: EdgeCachePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
