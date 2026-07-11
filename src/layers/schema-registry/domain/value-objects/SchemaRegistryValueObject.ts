/**
 * SchemaRegistry Value Object
 *
 * Immutable value object for the Schema registry and contract validation layer.
 */

export class SchemaRegistryValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('SchemaRegistry value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): SchemaRegistryValueObject {
    return new SchemaRegistryValueObject(value);
  }

  equals(other: SchemaRegistryValueObject): boolean {
    return other instanceof SchemaRegistryValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
