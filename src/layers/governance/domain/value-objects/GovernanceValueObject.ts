/**
 * Governance Value Object
 */

export class GovernanceValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): GovernanceValueObject {
    return new GovernanceValueObject(value, type);
  }

  equals(other: GovernanceValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
