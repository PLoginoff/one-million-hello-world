/**
 * CdnIntegration Value Object
 */

export class CdnIntegrationValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): CdnIntegrationValueObject {
    return new CdnIntegrationValueObject(value, type);
  }

  equals(other: CdnIntegrationValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
