/**
 * BatchProcessingPriority Value Object
 *
 * Priority level for batch-processing tasks.
 */

export class BatchProcessingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): BatchProcessingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new BatchProcessingPriority(value, label);
  }

  static low(): BatchProcessingPriority {
    return new BatchProcessingPriority(1, 'low');
  }
  static medium(): BatchProcessingPriority {
    return new BatchProcessingPriority(5, 'medium');
  }
  static high(): BatchProcessingPriority {
    return new BatchProcessingPriority(8, 'high');
  }
  static critical(): BatchProcessingPriority {
    return new BatchProcessingPriority(10, 'critical');
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

  isHigherThan(other: BatchProcessingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: BatchProcessingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: BatchProcessingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
