/**
 * AnomalyDetection Value Object
 */

export class AnomalyDetectionValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): AnomalyDetectionValueObject {
    return new AnomalyDetectionValueObject(value, type);
  }

  equals(other: AnomalyDetectionValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
