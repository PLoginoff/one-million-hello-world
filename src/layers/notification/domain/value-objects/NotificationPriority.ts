/**
 * NotificationPriority Value Object
 *
 * Priority level for notification tasks.
 */

export class NotificationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): NotificationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new NotificationPriority(value, label);
  }

  static low(): NotificationPriority {
    return new NotificationPriority(1, 'low');
  }
  static medium(): NotificationPriority {
    return new NotificationPriority(5, 'medium');
  }
  static high(): NotificationPriority {
    return new NotificationPriority(8, 'high');
  }
  static critical(): NotificationPriority {
    return new NotificationPriority(10, 'critical');
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

  isHigherThan(other: NotificationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: NotificationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: NotificationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
