/**
 * PolicyEnginePriority Value Object
 *
 * Priority level for policy-engine tasks.
 */

export class PolicyEnginePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): PolicyEnginePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new PolicyEnginePriority(value, label);
  }

  static low(): PolicyEnginePriority {
    return new PolicyEnginePriority(1, 'low');
  }
  static medium(): PolicyEnginePriority {
    return new PolicyEnginePriority(5, 'medium');
  }
  static high(): PolicyEnginePriority {
    return new PolicyEnginePriority(8, 'high');
  }
  static critical(): PolicyEnginePriority {
    return new PolicyEnginePriority(10, 'critical');
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

  isHigherThan(other: PolicyEnginePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: PolicyEnginePriority): boolean {
    return this.value < other.value;
  }

  equals(other: PolicyEnginePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
