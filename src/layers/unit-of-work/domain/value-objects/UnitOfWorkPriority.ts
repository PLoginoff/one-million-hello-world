/**
 * UnitOfWorkPriority Value Object
 *
 * Priority level for unit-of-work tasks.
 */

export class UnitOfWorkPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): UnitOfWorkPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new UnitOfWorkPriority(value, label);
  }

  static low(): UnitOfWorkPriority {
    return new UnitOfWorkPriority(1, 'low');
  }
  static medium(): UnitOfWorkPriority {
    return new UnitOfWorkPriority(5, 'medium');
  }
  static high(): UnitOfWorkPriority {
    return new UnitOfWorkPriority(8, 'high');
  }
  static critical(): UnitOfWorkPriority {
    return new UnitOfWorkPriority(10, 'critical');
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

  isHigherThan(other: UnitOfWorkPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: UnitOfWorkPriority): boolean {
    return this.value < other.value;
  }

  equals(other: UnitOfWorkPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
