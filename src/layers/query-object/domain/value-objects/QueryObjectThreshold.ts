/**
 * QueryObjectThreshold Value Object
 *
 * Configurable threshold value with min/max bounds.
 */

export class QueryObjectThreshold {
  readonly value: number;
  readonly min: number;
  readonly max: number;

  private constructor(value: number, min: number, max: number) {
    this.value = value;
    this.min = min;
    this.max = max;
  }

  static create(value: number, min: number = 0, max: number = 100): QueryObjectThreshold {
    if (value < min || value > max) {
      throw new Error('Threshold query-object value ' + value + ' out of range [' + min + ', ' + max + ']');
    }
    return new QueryObjectThreshold(value, min, max);
  }

  isAtMin(): boolean {
    return this.value === this.min;
  }
  isAtMax(): boolean {
    return this.value === this.max;
  }
  isBelow(other: QueryObjectThreshold): boolean {
    return this.value < other.value;
  }
  isAbove(other: QueryObjectThreshold): boolean {
    return this.value > other.value;
  }

  equals(other: QueryObjectThreshold): boolean {
    return this.value === other.value && this.min === other.min && this.max === other.max;
  }

  toString(): string {
    return this.value.toString();
  }
}
