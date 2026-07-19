/**
 * MlFeatureStore Value Object
 */

export class MlFeatureStoreValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): MlFeatureStoreValueObject {
    return new MlFeatureStoreValueObject(value, type);
  }

  equals(other: MlFeatureStoreValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
