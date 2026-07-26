/**
 * RepositoryPriority Value Object
 *
 * Priority level for repository tasks.
 */

export class RepositoryPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): RepositoryPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new RepositoryPriority(value, label);
  }

  static low(): RepositoryPriority {
    return new RepositoryPriority(1, 'low');
  }
  static medium(): RepositoryPriority {
    return new RepositoryPriority(5, 'medium');
  }
  static high(): RepositoryPriority {
    return new RepositoryPriority(8, 'high');
  }
  static critical(): RepositoryPriority {
    return new RepositoryPriority(10, 'critical');
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

  isHigherThan(other: RepositoryPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: RepositoryPriority): boolean {
    return this.value < other.value;
  }

  equals(other: RepositoryPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
