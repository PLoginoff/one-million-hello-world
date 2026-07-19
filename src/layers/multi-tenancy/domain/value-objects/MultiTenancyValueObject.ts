/**
 * MultiTenancy Value Object
 */

export class MultiTenancyValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): MultiTenancyValueObject {
    return new MultiTenancyValueObject(value, type);
  }

  equals(other: MultiTenancyValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
