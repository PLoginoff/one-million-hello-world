/**
 * QueryObject Value Object
 *
 * Immutable value object for the Query object and specification queries layer.
 */

export class QueryObjectValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('QueryObject value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): QueryObjectValueObject {
    return new QueryObjectValueObject(value);
  }

  equals(other: QueryObjectValueObject): boolean {
    return other instanceof QueryObjectValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
