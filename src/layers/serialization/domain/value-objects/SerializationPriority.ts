/**
 * SerializationPriority Value Object
 *
 * Priority level for serialization tasks.
 */

export class SerializationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SerializationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SerializationPriority(value, label);
  }

  static low(): SerializationPriority {
    return new SerializationPriority(1, 'low');
  }
  static medium(): SerializationPriority {
    return new SerializationPriority(5, 'medium');
  }
  static high(): SerializationPriority {
    return new SerializationPriority(8, 'high');
  }
  static critical(): SerializationPriority {
    return new SerializationPriority(10, 'critical');
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

  isHigherThan(other: SerializationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SerializationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SerializationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
