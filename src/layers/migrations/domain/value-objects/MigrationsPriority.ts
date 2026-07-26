/**
 * MigrationsPriority Value Object
 *
 * Priority level for migrations tasks.
 */

export class MigrationsPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): MigrationsPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new MigrationsPriority(value, label);
  }

  static low(): MigrationsPriority {
    return new MigrationsPriority(1, 'low');
  }
  static medium(): MigrationsPriority {
    return new MigrationsPriority(5, 'medium');
  }
  static high(): MigrationsPriority {
    return new MigrationsPriority(8, 'high');
  }
  static critical(): MigrationsPriority {
    return new MigrationsPriority(10, 'critical');
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

  isHigherThan(other: MigrationsPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: MigrationsPriority): boolean {
    return this.value < other.value;
  }

  equals(other: MigrationsPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
