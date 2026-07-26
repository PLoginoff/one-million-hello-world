/**
 * CompressionPriority Value Object
 *
 * Priority level for compression tasks.
 */

export class CompressionPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): CompressionPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new CompressionPriority(value, label);
  }

  static low(): CompressionPriority {
    return new CompressionPriority(1, 'low');
  }
  static medium(): CompressionPriority {
    return new CompressionPriority(5, 'medium');
  }
  static high(): CompressionPriority {
    return new CompressionPriority(8, 'high');
  }
  static critical(): CompressionPriority {
    return new CompressionPriority(10, 'critical');
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

  isHigherThan(other: CompressionPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: CompressionPriority): boolean {
    return this.value < other.value;
  }

  equals(other: CompressionPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
