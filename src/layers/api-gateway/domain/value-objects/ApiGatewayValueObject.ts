/**
 * ApiGateway Value Object
 *
 * Immutable value object for the API gateway abstraction, routing, and transformation layer.
 */

export class ApiGatewayValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('ApiGateway value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): ApiGatewayValueObject {
    return new ApiGatewayValueObject(value);
  }

  equals(other: ApiGatewayValueObject): boolean {
    return other instanceof ApiGatewayValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
