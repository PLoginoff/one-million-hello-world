/**
 * DataWarehouse Value Object
 *
 * Immutable value object for the Data warehouse abstraction layer.
 */

export class DataWarehouseValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('DataWarehouse value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): DataWarehouseValueObject {
    return new DataWarehouseValueObject(value);
  }

  equals(other: DataWarehouseValueObject): boolean {
    return other instanceof DataWarehouseValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
