/**
 * PolicyEngine Value Object
 *
 * Immutable value object for the Policy evaluation engine layer.
 */

export class PolicyEngineValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('PolicyEngine value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): PolicyEngineValueObject {
    return new PolicyEngineValueObject(value);
  }

  equals(other: PolicyEngineValueObject): boolean {
    return other instanceof PolicyEngineValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
