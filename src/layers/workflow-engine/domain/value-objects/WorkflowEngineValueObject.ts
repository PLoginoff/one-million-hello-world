/**
 * WorkflowEngine Value Object
 *
 * Immutable value object for the Workflow engine and state machines layer.
 */

export class WorkflowEngineValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('WorkflowEngine value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): WorkflowEngineValueObject {
    return new WorkflowEngineValueObject(value);
  }

  equals(other: WorkflowEngineValueObject): boolean {
    return other instanceof WorkflowEngineValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
