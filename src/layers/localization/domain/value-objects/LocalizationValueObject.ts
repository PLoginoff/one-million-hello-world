/**
 * Localization Value Object
 */

export class LocalizationValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): LocalizationValueObject {
    return new LocalizationValueObject(value, type);
  }

  equals(other: LocalizationValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
