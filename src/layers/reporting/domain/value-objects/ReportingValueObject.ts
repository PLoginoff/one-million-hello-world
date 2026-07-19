/**
 * Reporting Value Object
 */

export class ReportingValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): ReportingValueObject {
    return new ReportingValueObject(value, type);
  }

  equals(other: ReportingValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
