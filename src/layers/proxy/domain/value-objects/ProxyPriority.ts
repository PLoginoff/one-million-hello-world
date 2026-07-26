/**
 * ProxyPriority Value Object
 *
 * Priority level for proxy tasks.
 */

export class ProxyPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ProxyPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ProxyPriority(value, label);
  }

  static low(): ProxyPriority {
    return new ProxyPriority(1, 'low');
  }
  static medium(): ProxyPriority {
    return new ProxyPriority(5, 'medium');
  }
  static high(): ProxyPriority {
    return new ProxyPriority(8, 'high');
  }
  static critical(): ProxyPriority {
    return new ProxyPriority(10, 'critical');
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

  isHigherThan(other: ProxyPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ProxyPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ProxyPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
