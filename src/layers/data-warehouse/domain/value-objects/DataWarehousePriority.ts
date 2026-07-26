/**
 * DataWarehousePriority Value Object
 *
 * Priority level for data-warehouse tasks.
 */

export class DataWarehousePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DataWarehousePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DataWarehousePriority(value, label);
  }

  static low(): DataWarehousePriority {
    return new DataWarehousePriority(1, 'low');
  }
  static medium(): DataWarehousePriority {
    return new DataWarehousePriority(5, 'medium');
  }
  static high(): DataWarehousePriority {
    return new DataWarehousePriority(8, 'high');
  }
  static critical(): DataWarehousePriority {
    return new DataWarehousePriority(10, 'critical');
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

  isHigherThan(other: DataWarehousePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DataWarehousePriority): boolean {
    return this.value < other.value;
  }

  equals(other: DataWarehousePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
