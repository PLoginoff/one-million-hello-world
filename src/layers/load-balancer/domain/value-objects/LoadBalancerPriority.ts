/**
 * LoadBalancerPriority Value Object
 *
 * Priority level for load-balancer tasks.
 */

export class LoadBalancerPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): LoadBalancerPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new LoadBalancerPriority(value, label);
  }

  static low(): LoadBalancerPriority {
    return new LoadBalancerPriority(1, 'low');
  }
  static medium(): LoadBalancerPriority {
    return new LoadBalancerPriority(5, 'medium');
  }
  static high(): LoadBalancerPriority {
    return new LoadBalancerPriority(8, 'high');
  }
  static critical(): LoadBalancerPriority {
    return new LoadBalancerPriority(10, 'critical');
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

  isHigherThan(other: LoadBalancerPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: LoadBalancerPriority): boolean {
    return this.value < other.value;
  }

  equals(other: LoadBalancerPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
