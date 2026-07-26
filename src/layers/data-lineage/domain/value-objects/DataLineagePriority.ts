/**
 * DataLineagePriority Value Object
 *
 * Priority level for data-lineage tasks.
 */

export class DataLineagePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DataLineagePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DataLineagePriority(value, label);
  }

  static low(): DataLineagePriority {
    return new DataLineagePriority(1, 'low');
  }
  static medium(): DataLineagePriority {
    return new DataLineagePriority(5, 'medium');
  }
  static high(): DataLineagePriority {
    return new DataLineagePriority(8, 'high');
  }
  static critical(): DataLineagePriority {
    return new DataLineagePriority(10, 'critical');
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

  isHigherThan(other: DataLineagePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DataLineagePriority): boolean {
    return this.value < other.value;
  }

  equals(other: DataLineagePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
