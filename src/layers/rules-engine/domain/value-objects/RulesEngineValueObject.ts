/**
 * RulesEngine Value Object
 *
 * Immutable value object for the Business rules engine layer.
 */

export class RulesEngineValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('RulesEngine value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): RulesEngineValueObject {
    return new RulesEngineValueObject(value);
  }

  equals(other: RulesEngineValueObject): boolean {
    return other instanceof RulesEngineValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
