/**
 * BotDetectionPriority Value Object
 *
 * Priority level for bot-detection tasks.
 */

export class BotDetectionPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): BotDetectionPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new BotDetectionPriority(value, label);
  }

  static low(): BotDetectionPriority {
    return new BotDetectionPriority(1, 'low');
  }
  static medium(): BotDetectionPriority {
    return new BotDetectionPriority(5, 'medium');
  }
  static high(): BotDetectionPriority {
    return new BotDetectionPriority(8, 'high');
  }
  static critical(): BotDetectionPriority {
    return new BotDetectionPriority(10, 'critical');
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

  isHigherThan(other: BotDetectionPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: BotDetectionPriority): boolean {
    return this.value < other.value;
  }

  equals(other: BotDetectionPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
