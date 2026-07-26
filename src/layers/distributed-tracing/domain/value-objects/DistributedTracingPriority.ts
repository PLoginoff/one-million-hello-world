/**
 * DistributedTracingPriority Value Object
 *
 * Priority level for distributed-tracing tasks.
 */

export class DistributedTracingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): DistributedTracingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new DistributedTracingPriority(value, label);
  }

  static low(): DistributedTracingPriority {
    return new DistributedTracingPriority(1, 'low');
  }
  static medium(): DistributedTracingPriority {
    return new DistributedTracingPriority(5, 'medium');
  }
  static high(): DistributedTracingPriority {
    return new DistributedTracingPriority(8, 'high');
  }
  static critical(): DistributedTracingPriority {
    return new DistributedTracingPriority(10, 'critical');
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

  isHigherThan(other: DistributedTracingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: DistributedTracingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: DistributedTracingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
