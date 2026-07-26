/**
 * BackupPriority Value Object
 *
 * Priority level for backup tasks.
 */

export class BackupPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): BackupPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new BackupPriority(value, label);
  }

  static low(): BackupPriority {
    return new BackupPriority(1, 'low');
  }
  static medium(): BackupPriority {
    return new BackupPriority(5, 'medium');
  }
  static high(): BackupPriority {
    return new BackupPriority(8, 'high');
  }
  static critical(): BackupPriority {
    return new BackupPriority(10, 'critical');
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

  isHigherThan(other: BackupPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: BackupPriority): boolean {
    return this.value < other.value;
  }

  equals(other: BackupPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
