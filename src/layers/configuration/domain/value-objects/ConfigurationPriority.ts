/**
 * ConfigurationPriority Value Object
 *
 * Priority level for configuration tasks.
 */

export class ConfigurationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ConfigurationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ConfigurationPriority(value, label);
  }

  static low(): ConfigurationPriority {
    return new ConfigurationPriority(1, 'low');
  }
  static medium(): ConfigurationPriority {
    return new ConfigurationPriority(5, 'medium');
  }
  static high(): ConfigurationPriority {
    return new ConfigurationPriority(8, 'high');
  }
  static critical(): ConfigurationPriority {
    return new ConfigurationPriority(10, 'critical');
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

  isHigherThan(other: ConfigurationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ConfigurationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ConfigurationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
