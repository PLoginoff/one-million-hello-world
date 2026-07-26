/**
 * ApiGatewayPriority Value Object
 *
 * Priority level for api-gateway tasks.
 */

export class ApiGatewayPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): ApiGatewayPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new ApiGatewayPriority(value, label);
  }

  static low(): ApiGatewayPriority {
    return new ApiGatewayPriority(1, 'low');
  }
  static medium(): ApiGatewayPriority {
    return new ApiGatewayPriority(5, 'medium');
  }
  static high(): ApiGatewayPriority {
    return new ApiGatewayPriority(8, 'high');
  }
  static critical(): ApiGatewayPriority {
    return new ApiGatewayPriority(10, 'critical');
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

  isHigherThan(other: ApiGatewayPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: ApiGatewayPriority): boolean {
    return this.value < other.value;
  }

  equals(other: ApiGatewayPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
