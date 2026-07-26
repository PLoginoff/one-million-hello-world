/**
 * BlueGreenDeployPriority Value Object
 *
 * Priority level for blue-green-deploy tasks.
 */

export class BlueGreenDeployPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): BlueGreenDeployPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new BlueGreenDeployPriority(value, label);
  }

  static low(): BlueGreenDeployPriority {
    return new BlueGreenDeployPriority(1, 'low');
  }
  static medium(): BlueGreenDeployPriority {
    return new BlueGreenDeployPriority(5, 'medium');
  }
  static high(): BlueGreenDeployPriority {
    return new BlueGreenDeployPriority(8, 'high');
  }
  static critical(): BlueGreenDeployPriority {
    return new BlueGreenDeployPriority(10, 'critical');
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

  isHigherThan(other: BlueGreenDeployPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: BlueGreenDeployPriority): boolean {
    return this.value < other.value;
  }

  equals(other: BlueGreenDeployPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
