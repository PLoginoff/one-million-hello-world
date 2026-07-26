/**
 * SecretsRotationPriority Value Object
 *
 * Priority level for secrets-rotation tasks.
 */

export class SecretsRotationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SecretsRotationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SecretsRotationPriority(value, label);
  }

  static low(): SecretsRotationPriority {
    return new SecretsRotationPriority(1, 'low');
  }
  static medium(): SecretsRotationPriority {
    return new SecretsRotationPriority(5, 'medium');
  }
  static high(): SecretsRotationPriority {
    return new SecretsRotationPriority(8, 'high');
  }
  static critical(): SecretsRotationPriority {
    return new SecretsRotationPriority(10, 'critical');
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

  isHigherThan(other: SecretsRotationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SecretsRotationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SecretsRotationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
