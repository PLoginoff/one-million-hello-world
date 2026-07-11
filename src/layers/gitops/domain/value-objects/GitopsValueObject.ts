/**
 * Gitops Value Object
 *
 * Immutable value object for the GitOps deployment reconciliation layer.
 */

export class GitopsValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Gitops value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): GitopsValueObject {
    return new GitopsValueObject(value);
  }

  equals(other: GitopsValueObject): boolean {
    return other instanceof GitopsValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
