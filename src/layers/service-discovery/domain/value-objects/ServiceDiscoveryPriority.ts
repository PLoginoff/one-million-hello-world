/**
 * ServiceDiscoveryPriority Value Object
 *
 * Priority level for service-discovery tasks.
 */

export class ServiceDiscoveryPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ServiceDiscoveryPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ServiceDiscoveryPriority(value, label);
  }

  static low(): ServiceDiscoveryPriority {
    return new ServiceDiscoveryPriority(1, 'low');
  }
  static medium(): ServiceDiscoveryPriority {
    return new ServiceDiscoveryPriority(5, 'medium');
  }
  static high(): ServiceDiscoveryPriority {
    return new ServiceDiscoveryPriority(8, 'high');
  }
  static critical(): ServiceDiscoveryPriority {
    return new ServiceDiscoveryPriority(10, 'critical');
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

  isHigherThan(other: ServiceDiscoveryPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ServiceDiscoveryPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ServiceDiscoveryPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
