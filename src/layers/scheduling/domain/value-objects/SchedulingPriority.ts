/**
 * SchedulingPriority Value Object
 *
 * Priority level for scheduling tasks.
 */

export class SchedulingPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SchedulingPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SchedulingPriority(value, label);
  }

  static low(): SchedulingPriority {
    return new SchedulingPriority(1, 'low');
  }
  static medium(): SchedulingPriority {
    return new SchedulingPriority(5, 'medium');
  }
  static high(): SchedulingPriority {
    return new SchedulingPriority(8, 'high');
  }
  static critical(): SchedulingPriority {
    return new SchedulingPriority(10, 'critical');
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

  isHigherThan(other: SchedulingPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SchedulingPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SchedulingPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
