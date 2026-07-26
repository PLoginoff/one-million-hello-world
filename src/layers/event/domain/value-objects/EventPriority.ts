/**
 * EventPriority Value Object
 *
 * Priority level for event tasks.
 */

export class EventPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): EventPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new EventPriority(value, label);
  }

  static low(): EventPriority {
    return new EventPriority(1, 'low');
  }
  static medium(): EventPriority {
    return new EventPriority(5, 'medium');
  }
  static high(): EventPriority {
    return new EventPriority(8, 'high');
  }
  static critical(): EventPriority {
    return new EventPriority(10, 'critical');
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

  isHigherThan(other: EventPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: EventPriority): boolean {
    return this.value < other.value;
  }

  equals(other: EventPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
