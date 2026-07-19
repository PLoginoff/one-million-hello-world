/**
 * SecretsRotation Value Object
 */

export class SecretsRotationValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): SecretsRotationValueObject {
    return new SecretsRotationValueObject(value, type);
  }

  equals(other: SecretsRotationValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
