/**
 * DisasterRecovery Value Object
 */

export class DisasterRecoveryValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): DisasterRecoveryValueObject {
    return new DisasterRecoveryValueObject(value, type);
  }

  equals(other: DisasterRecoveryValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
