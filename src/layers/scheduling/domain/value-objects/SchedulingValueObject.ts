/**
 * Scheduling Value Object
 */

export class SchedulingValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): SchedulingValueObject {
    return new SchedulingValueObject(value, type);
  }

  equals(other: SchedulingValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
