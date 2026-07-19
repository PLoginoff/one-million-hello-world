/**
 * ApiVersioning Value Object
 */

export class ApiVersioningValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): ApiVersioningValueObject {
    return new ApiVersioningValueObject(value, type);
  }

  equals(other: ApiVersioningValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
