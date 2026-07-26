/**
 * WorkflowEngineThreshold Value Object
 *
 * Configurable threshold value with min/max bounds.
 */

export class WorkflowEngineThreshold {
  readonly value: number;
  readonly min: number;
  readonly max: number;

  private constructor(value: number, min: number, max: number) {
    this.value = value;
    this.min = min;
    this.max = max;
  }

  static create(value: number, min: number = 0, max: number = 100): WorkflowEngineThreshold {
    if (value < min || value > max) {
      throw new Error('Threshold workflow-engine value ' + value + ' out of range [' + min + ', ' + max + ']');
    }
    return new WorkflowEngineThreshold(value, min, max);
  }

  isAtMin(): boolean {
    return this.value === this.min;
  }
  isAtMax(): boolean {
    return this.value === this.max;
  }
  isBelow(other: WorkflowEngineThreshold): boolean {
    return this.value < other.value;
  }
  isAbove(other: WorkflowEngineThreshold): boolean {
    return this.value > other.value;
  }

  equals(other: WorkflowEngineThreshold): boolean {
    return this.value === other.value && this.min === other.min && this.max === other.max;
  }

  toString(): string {
    return this.value.toString();
  }
}
