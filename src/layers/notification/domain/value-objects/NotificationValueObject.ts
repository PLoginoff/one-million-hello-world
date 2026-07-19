/**
 * Notification Value Object
 */

export class NotificationValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): NotificationValueObject {
    return new NotificationValueObject(value, type);
  }

  equals(other: NotificationValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
