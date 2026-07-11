/**
 * EtlPipeline Value Object
 *
 * Immutable value object for the ETL pipeline orchestration layer.
 */

export class EtlPipelineValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('EtlPipeline value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): EtlPipelineValueObject {
    return new EtlPipelineValueObject(value);
  }

  equals(other: EtlPipelineValueObject): boolean {
    return other instanceof EtlPipelineValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
