/**
 * CanaryDeployPriority Value Object
 *
 * Priority level for canary-deploy tasks.
 */

export class CanaryDeployPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): CanaryDeployPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new CanaryDeployPriority(value, label);
  }

  static low(): CanaryDeployPriority {
    return new CanaryDeployPriority(1, 'low');
  }
  static medium(): CanaryDeployPriority {
    return new CanaryDeployPriority(5, 'medium');
  }
  static high(): CanaryDeployPriority {
    return new CanaryDeployPriority(8, 'high');
  }
  static critical(): CanaryDeployPriority {
    return new CanaryDeployPriority(10, 'critical');
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

  isHigherThan(other: CanaryDeployPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: CanaryDeployPriority): boolean {
    return this.value < other.value;
  }

  equals(other: CanaryDeployPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
