/**
 * DataLakePriority Value Object
 *
 * Priority level for data-lake tasks.
 */

export class DataLakePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DataLakePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DataLakePriority(value, label);
  }

  static low(): DataLakePriority {
    return new DataLakePriority(1, 'low');
  }
  static medium(): DataLakePriority {
    return new DataLakePriority(5, 'medium');
  }
  static high(): DataLakePriority {
    return new DataLakePriority(8, 'high');
  }
  static critical(): DataLakePriority {
    return new DataLakePriority(10, 'critical');
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

  isHigherThan(other: DataLakePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DataLakePriority): boolean {
    return this.value < other.value;
  }

  equals(other: DataLakePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
