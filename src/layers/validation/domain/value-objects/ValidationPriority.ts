/**
 * ValidationPriority Value Object
 *
 * Priority level for validation tasks.
 */

export class ValidationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ValidationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ValidationPriority(value, label);
  }

  static low(): ValidationPriority {
    return new ValidationPriority(1, 'low');
  }
  static medium(): ValidationPriority {
    return new ValidationPriority(5, 'medium');
  }
  static high(): ValidationPriority {
    return new ValidationPriority(8, 'high');
  }
  static critical(): ValidationPriority {
    return new ValidationPriority(10, 'critical');
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

  isHigherThan(other: ValidationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ValidationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ValidationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
