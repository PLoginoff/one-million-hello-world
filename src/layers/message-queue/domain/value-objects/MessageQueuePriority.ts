/**
 * MessageQueuePriority Value Object
 *
 * Priority level for message-queue tasks.
 */

export class MessageQueuePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): MessageQueuePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new MessageQueuePriority(value, label);
  }

  static low(): MessageQueuePriority {
    return new MessageQueuePriority(1, 'low');
  }
  static medium(): MessageQueuePriority {
    return new MessageQueuePriority(5, 'medium');
  }
  static high(): MessageQueuePriority {
    return new MessageQueuePriority(8, 'high');
  }
  static critical(): MessageQueuePriority {
    return new MessageQueuePriority(10, 'critical');
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

  isHigherThan(other: MessageQueuePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: MessageQueuePriority): boolean {
    return this.value < other.value;
  }

  equals(other: MessageQueuePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
