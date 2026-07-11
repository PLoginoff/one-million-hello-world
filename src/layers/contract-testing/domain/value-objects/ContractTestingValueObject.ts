/**
 * ContractTesting Value Object
 *
 * Immutable value object for the Contract testing layer layer.
 */

export class ContractTestingValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('ContractTesting value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ContractTestingValueObject {
    return new ContractTestingValueObject(value);
  }

  equals(other: ContractTestingValueObject): boolean {
    return other instanceof ContractTestingValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
