/**
 * CostOptimization Value Object
 */

export class CostOptimizationValueObject {
  readonly value: unknown;
  readonly type: string;

  private constructor(value: unknown, type: string) {
    this.value = value;
    this.type = type;
  }

  static create(value: unknown, type: string = 'default'): CostOptimizationValueObject {
    return new CostOptimizationValueObject(value, type);
  }

  equals(other: CostOptimizationValueObject): boolean {
    return this.type === other.type && this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
