/**
 * ApiVersioningPriority Value Object
 *
 * Priority level for api-versioning tasks.
 */

export class ApiVersioningPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ApiVersioningPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ApiVersioningPriority(value, label);
  }

  static low(): ApiVersioningPriority {
    return new ApiVersioningPriority(1, 'low');
  }
  static medium(): ApiVersioningPriority {
    return new ApiVersioningPriority(5, 'medium');
  }
  static high(): ApiVersioningPriority {
    return new ApiVersioningPriority(8, 'high');
  }
  static critical(): ApiVersioningPriority {
    return new ApiVersioningPriority(10, 'critical');
  }

  isLow(): boolean {
    return this.value <= 2;
  }
  isMedium(): boolean {
    return this.value > 2 && this.value <= 5;
  }
  isHigh(): boolean {
    return this.value > 5 && this.value <= 8;
  }
  isCritical(): boolean {
    return this.value > 8;
  }

  isHigherThan(other: ApiVersioningPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ApiVersioningPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ApiVersioningPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
