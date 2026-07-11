/**
 * DataQuality Value Object
 *
 * Immutable value object for the Data quality validation layer.
 */

export class DataQualityValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('DataQuality value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): DataQualityValueObject {
    return new DataQualityValueObject(value);
  }

  equals(other: DataQualityValueObject): boolean {
    return other instanceof DataQualityValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
