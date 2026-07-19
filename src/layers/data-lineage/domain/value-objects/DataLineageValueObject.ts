/**
 * DataLineage Value Object
 */

export class DataLineageValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): DataLineageValueObject {
    return new DataLineageValueObject(value, type);
  }

  equals(other: DataLineageValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
