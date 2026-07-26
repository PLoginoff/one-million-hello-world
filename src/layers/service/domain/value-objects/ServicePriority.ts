/**
 * ServicePriority Value Object
 *
 * Priority level for service tasks.
 */

export class ServicePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ServicePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ServicePriority(value, label);
  }

  static low(): ServicePriority {
    return new ServicePriority(1, 'low');
  }
  static medium(): ServicePriority {
    return new ServicePriority(5, 'medium');
  }
  static high(): ServicePriority {
    return new ServicePriority(8, 'high');
  }
  static critical(): ServicePriority {
    return new ServicePriority(10, 'critical');
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

  isHigherThan(other: ServicePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ServicePriority): boolean {
    return this.value < other.value;
  }

  equals(other: ServicePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
