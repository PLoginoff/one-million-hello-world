/**
 * CanaryDeploy Value Object
 *
 * Immutable value object for the Canary deployment and rollout gating layer.
 */

export class CanaryDeployValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('CanaryDeploy value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): CanaryDeployValueObject {
    return new CanaryDeployValueObject(value);
  }

  equals(other: CanaryDeployValueObject): boolean {
    return other instanceof CanaryDeployValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
