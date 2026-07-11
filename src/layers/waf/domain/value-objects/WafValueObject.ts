/**
 * Waf Value Object
 *
 * Immutable value object for the Web Application Firewall layer.
 */

export class WafValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Waf value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): WafValueObject {
    return new WafValueObject(value);
  }

  equals(other: WafValueObject): boolean {
    return other instanceof WafValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
