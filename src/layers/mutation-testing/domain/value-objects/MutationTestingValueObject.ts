/**
 * MutationTesting Value Object
 *
 * Immutable value object for the Mutation testing layer layer.
 */

export class MutationTestingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('MutationTesting value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): MutationTestingValueObject {
    return new MutationTestingValueObject(value);
  }

  equals(other: MutationTestingValueObject): boolean {
    return other instanceof MutationTestingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
