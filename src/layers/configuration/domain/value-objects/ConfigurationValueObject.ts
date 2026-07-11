/**
 * Configuration Value Object
 *
 * Immutable value object for the Configuration management and dynamic settings layer.
 */

export class ConfigurationValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Configuration value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ConfigurationValueObject {
    return new ConfigurationValueObject(value);
  }

  equals(other: ConfigurationValueObject): boolean {
    return other instanceof ConfigurationValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
