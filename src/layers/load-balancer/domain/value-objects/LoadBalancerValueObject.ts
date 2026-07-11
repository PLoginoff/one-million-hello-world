/**
 * LoadBalancer Value Object
 *
 * Immutable value object for the Load balancing and traffic distribution layer.
 */

export class LoadBalancerValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('LoadBalancer value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): LoadBalancerValueObject {
    return new LoadBalancerValueObject(value);
  }

  equals(other: LoadBalancerValueObject): boolean {
    return other instanceof LoadBalancerValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
