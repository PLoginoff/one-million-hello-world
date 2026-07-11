/**
 * Migrations Value Object
 *
 * Immutable value object for the Database migration and versioning layer.
 */

export class MigrationsValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Migrations value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): MigrationsValueObject {
    return new MigrationsValueObject(value);
  }

  equals(other: MigrationsValueObject): boolean {
    return other instanceof MigrationsValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
