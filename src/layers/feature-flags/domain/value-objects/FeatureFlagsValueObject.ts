/**
 * FeatureFlags Value Object
 *
 * Immutable value object for the Feature flags and dynamic toggles layer.
 */

export class FeatureFlagsValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('FeatureFlags value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): FeatureFlagsValueObject {
    return new FeatureFlagsValueObject(value);
  }

  equals(other: FeatureFlagsValueObject): boolean {
    return other instanceof FeatureFlagsValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
