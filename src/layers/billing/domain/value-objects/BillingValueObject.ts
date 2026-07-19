/**
 * Billing Value Object
 */

export class BillingValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): BillingValueObject {
    return new BillingValueObject(value, type);
  }

  equals(other: BillingValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
