/**
 * SnapshotPriority Value Object
 *
 * Priority level for snapshot tasks.
 */

export class SnapshotPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SnapshotPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SnapshotPriority(value, label);
  }

  static low(): SnapshotPriority {
    return new SnapshotPriority(1, 'low');
  }
  static medium(): SnapshotPriority {
    return new SnapshotPriority(5, 'medium');
  }
  static high(): SnapshotPriority {
    return new SnapshotPriority(8, 'high');
  }
  static critical(): SnapshotPriority {
    return new SnapshotPriority(10, 'critical');
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

  isHigherThan(other: SnapshotPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SnapshotPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SnapshotPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
