/**
 * DataLake Value Object
 *
 * Immutable value object for the Data lake ingestion and storage layer.
 */

export class DataLakeValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('DataLake value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): DataLakeValueObject {
    return new DataLakeValueObject(value);
  }

  equals(other: DataLakeValueObject): boolean {
    return other instanceof DataLakeValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
