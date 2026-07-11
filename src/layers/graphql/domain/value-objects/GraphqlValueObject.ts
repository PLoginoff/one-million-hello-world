/**
 * Graphql Value Object
 *
 * Immutable value object for the GraphQL query parsing and resolver orchestration layer.
 */

export class GraphqlValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Graphql value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): GraphqlValueObject {
    return new GraphqlValueObject(value);
  }

  equals(other: GraphqlValueObject): boolean {
    return other instanceof GraphqlValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
