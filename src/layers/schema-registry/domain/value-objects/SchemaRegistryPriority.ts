/**
 * SchemaRegistryPriority Value Object
 *
 * Priority level for schema-registry tasks.
 */

export class SchemaRegistryPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): SchemaRegistryPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new SchemaRegistryPriority(value, label);
  }

  static low(): SchemaRegistryPriority {
    return new SchemaRegistryPriority(1, 'low');
  }
  static medium(): SchemaRegistryPriority {
    return new SchemaRegistryPriority(5, 'medium');
  }
  static high(): SchemaRegistryPriority {
    return new SchemaRegistryPriority(8, 'high');
  }
  static critical(): SchemaRegistryPriority {
    return new SchemaRegistryPriority(10, 'critical');
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

  isHigherThan(other: SchemaRegistryPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: SchemaRegistryPriority): boolean {
    return this.value < other.value;
  }

  equals(other: SchemaRegistryPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
