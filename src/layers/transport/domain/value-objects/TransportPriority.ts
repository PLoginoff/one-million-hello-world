/**
 * TransportPriority Value Object
 *
 * Priority level for transport tasks.
 */

export class TransportPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): TransportPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new TransportPriority(value, label);
  }

  static low(): TransportPriority {
    return new TransportPriority(1, 'low');
  }
  static medium(): TransportPriority {
    return new TransportPriority(5, 'medium');
  }
  static high(): TransportPriority {
    return new TransportPriority(8, 'high');
  }
  static critical(): TransportPriority {
    return new TransportPriority(10, 'critical');
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

  isHigherThan(other: TransportPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: TransportPriority): boolean {
    return this.value < other.value;
  }

  equals(other: TransportPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
