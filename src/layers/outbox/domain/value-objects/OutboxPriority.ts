/**
 * OutboxPriority Value Object
 *
 * Priority level for outbox tasks.
 */

export class OutboxPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): OutboxPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new OutboxPriority(value, label);
  }

  static low(): OutboxPriority {
    return new OutboxPriority(1, 'low');
  }
  static medium(): OutboxPriority {
    return new OutboxPriority(5, 'medium');
  }
  static high(): OutboxPriority {
    return new OutboxPriority(8, 'high');
  }
  static critical(): OutboxPriority {
    return new OutboxPriority(10, 'critical');
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

  isHigherThan(other: OutboxPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: OutboxPriority): boolean {
    return this.value < other.value;
  }

  equals(other: OutboxPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
