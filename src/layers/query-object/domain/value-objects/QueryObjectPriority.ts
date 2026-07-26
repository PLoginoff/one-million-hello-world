/**
 * QueryObjectPriority Value Object
 *
 * Priority level for query-object tasks.
 */

export class QueryObjectPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): QueryObjectPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new QueryObjectPriority(value, label);
  }

  static low(): QueryObjectPriority {
    return new QueryObjectPriority(1, 'low');
  }
  static medium(): QueryObjectPriority {
    return new QueryObjectPriority(5, 'medium');
  }
  static high(): QueryObjectPriority {
    return new QueryObjectPriority(8, 'high');
  }
  static critical(): QueryObjectPriority {
    return new QueryObjectPriority(10, 'critical');
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

  isHigherThan(other: QueryObjectPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: QueryObjectPriority): boolean {
    return this.value < other.value;
  }

  equals(other: QueryObjectPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
