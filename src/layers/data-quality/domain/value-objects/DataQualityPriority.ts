/**
 * DataQualityPriority Value Object
 *
 * Priority level for data-quality tasks.
 */

export class DataQualityPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DataQualityPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DataQualityPriority(value, label);
  }

  static low(): DataQualityPriority {
    return new DataQualityPriority(1, 'low');
  }
  static medium(): DataQualityPriority {
    return new DataQualityPriority(5, 'medium');
  }
  static high(): DataQualityPriority {
    return new DataQualityPriority(8, 'high');
  }
  static critical(): DataQualityPriority {
    return new DataQualityPriority(10, 'critical');
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

  isHigherThan(other: DataQualityPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DataQualityPriority): boolean {
    return this.value < other.value;
  }

  equals(other: DataQualityPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
