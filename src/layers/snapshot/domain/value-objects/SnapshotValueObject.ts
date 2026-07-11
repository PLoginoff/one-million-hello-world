/**
 * Snapshot Value Object
 *
 * Immutable value object for the Snapshot storage and optimization layer.
 */

export class SnapshotValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Snapshot value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): SnapshotValueObject {
    return new SnapshotValueObject(value);
  }

  equals(other: SnapshotValueObject): boolean {
    return other instanceof SnapshotValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
