/**
 * ServiceDiscovery Value Object
 *
 * Immutable value object for the Service discovery and registration layer.
 */

export class ServiceDiscoveryValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('ServiceDiscovery value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ServiceDiscoveryValueObject {
    return new ServiceDiscoveryValueObject(value);
  }

  equals(other: ServiceDiscoveryValueObject): boolean {
    return other instanceof ServiceDiscoveryValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
