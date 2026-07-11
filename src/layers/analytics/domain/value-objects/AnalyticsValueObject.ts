/**
 * Analytics Value Object
 *
 * Immutable value object for the Analytics and event tracking layer.
 */

export class AnalyticsValueObject {
  readonly value: string;

  constructor(value: string) {
    if (!value || value.length === 0) {
      throw new Error('Analytics value cannot be empty');
    }
    this.value = value;
  }

  static create(value: string): AnalyticsValueObject {
    return new AnalyticsValueObject(value);
  }

  equals(other: AnalyticsValueObject): boolean {
    return other instanceof AnalyticsValueObject && this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
