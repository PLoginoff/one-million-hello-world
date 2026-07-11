/**
 * ChaosEngineering Value Object
 *
 * Immutable value object for the Chaos engineering and fault injection layer.
 */

export class ChaosEngineeringValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('ChaosEngineering value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ChaosEngineeringValueObject {
    return new ChaosEngineeringValueObject(value);
  }

  equals(other: ChaosEngineeringValueObject): boolean {
    return other instanceof ChaosEngineeringValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
