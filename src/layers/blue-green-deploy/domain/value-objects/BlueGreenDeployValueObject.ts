/**
 * BlueGreenDeploy Value Object
 *
 * Immutable value object for the Blue-green deployment strategy layer.
 */

export class BlueGreenDeployValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('BlueGreenDeploy value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): BlueGreenDeployValueObject {
    return new BlueGreenDeployValueObject(value);
  }

  equals(other: BlueGreenDeployValueObject): boolean {
    return other instanceof BlueGreenDeployValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
