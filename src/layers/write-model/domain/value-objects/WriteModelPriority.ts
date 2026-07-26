/**
 * WriteModelPriority Value Object
 *
 * Priority level for write-model tasks.
 */

export class WriteModelPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): WriteModelPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new WriteModelPriority(value, label);
  }

  static low(): WriteModelPriority {
    return new WriteModelPriority(1, 'low');
  }
  static medium(): WriteModelPriority {
    return new WriteModelPriority(5, 'medium');
  }
  static high(): WriteModelPriority {
    return new WriteModelPriority(8, 'high');
  }
  static critical(): WriteModelPriority {
    return new WriteModelPriority(10, 'critical');
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

  isHigherThan(other: WriteModelPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: WriteModelPriority): boolean {
    return this.value < other.value;
  }

  equals(other: WriteModelPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
