/**
 * GitopsPriority Value Object
 *
 * Priority level for gitops tasks.
 */

export class GitopsPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): GitopsPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new GitopsPriority(value, label);
  }

  static low(): GitopsPriority {
    return new GitopsPriority(1, 'low');
  }
  static medium(): GitopsPriority {
    return new GitopsPriority(5, 'medium');
  }
  static high(): GitopsPriority {
    return new GitopsPriority(8, 'high');
  }
  static critical(): GitopsPriority {
    return new GitopsPriority(10, 'critical');
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

  isHigherThan(other: GitopsPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: GitopsPriority): boolean {
    return this.value < other.value;
  }

  equals(other: GitopsPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
