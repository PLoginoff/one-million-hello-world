/**
 * SagaPriority Value Object
 *
 * Priority level for saga tasks.
 */

export class SagaPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SagaPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SagaPriority(value, label);
  }

  static low(): SagaPriority {
    return new SagaPriority(1, 'low');
  }
  static medium(): SagaPriority {
    return new SagaPriority(5, 'medium');
  }
  static high(): SagaPriority {
    return new SagaPriority(8, 'high');
  }
  static critical(): SagaPriority {
    return new SagaPriority(10, 'critical');
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

  isHigherThan(other: SagaPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SagaPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SagaPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
