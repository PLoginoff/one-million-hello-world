/**
 * BatchProcessing Value Object
 */

export class BatchProcessingValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): BatchProcessingValueObject {
    return new BatchProcessingValueObject(value, type);
  }

  equals(other: BatchProcessingValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
