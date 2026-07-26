/**
 * InboxPriority Value Object
 *
 * Priority level for inbox tasks.
 */

export class InboxPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): InboxPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new InboxPriority(value, label);
  }

  static low(): InboxPriority {
    return new InboxPriority(1, 'low');
  }
  static medium(): InboxPriority {
    return new InboxPriority(5, 'medium');
  }
  static high(): InboxPriority {
    return new InboxPriority(8, 'high');
  }
  static critical(): InboxPriority {
    return new InboxPriority(10, 'critical');
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

  isHigherThan(other: InboxPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: InboxPriority): boolean {
    return this.value < other.value;
  }

  equals(other: InboxPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
