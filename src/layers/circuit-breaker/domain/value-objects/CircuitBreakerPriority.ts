/**
 * CircuitBreakerPriority Value Object
 *
 * Priority level for circuit-breaker tasks.
 */

export class CircuitBreakerPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): CircuitBreakerPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new CircuitBreakerPriority(value, label);
  }

  static low(): CircuitBreakerPriority {
    return new CircuitBreakerPriority(1, 'low');
  }
  static medium(): CircuitBreakerPriority {
    return new CircuitBreakerPriority(5, 'medium');
  }
  static high(): CircuitBreakerPriority {
    return new CircuitBreakerPriority(8, 'high');
  }
  static critical(): CircuitBreakerPriority {
    return new CircuitBreakerPriority(10, 'critical');
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

  isHigherThan(other: CircuitBreakerPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: CircuitBreakerPriority): boolean {
    return this.value < other.value;
  }

  equals(other: CircuitBreakerPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
