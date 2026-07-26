/**
 * StreamProcessingPriority Value Object
 *
 * Priority level for stream-processing tasks.
 */

export class StreamProcessingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): StreamProcessingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new StreamProcessingPriority(value, label);
  }

  static low(): StreamProcessingPriority {
    return new StreamProcessingPriority(1, 'low');
  }
  static medium(): StreamProcessingPriority {
    return new StreamProcessingPriority(5, 'medium');
  }
  static high(): StreamProcessingPriority {
    return new StreamProcessingPriority(8, 'high');
  }
  static critical(): StreamProcessingPriority {
    return new StreamProcessingPriority(10, 'critical');
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

  isHigherThan(other: StreamProcessingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: StreamProcessingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: StreamProcessingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
