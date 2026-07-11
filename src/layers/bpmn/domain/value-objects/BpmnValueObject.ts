/**
 * Bpmn Value Object
 *
 * Immutable value object for the BPMN process execution layer.
 */

export class BpmnValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Bpmn value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): BpmnValueObject {
    return new BpmnValueObject(value);
  }

  equals(other: BpmnValueObject): boolean {
    return other instanceof BpmnValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
