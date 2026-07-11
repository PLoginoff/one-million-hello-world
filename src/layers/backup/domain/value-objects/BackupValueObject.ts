/**
 * Backup Value Object
 *
 * Immutable value object for the Backup and disaster recovery layer.
 */

export class BackupValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Backup value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): BackupValueObject {
    return new BackupValueObject(value);
  }

  equals(other: BackupValueObject): boolean {
    return other instanceof BackupValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
