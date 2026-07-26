/**
 * Oauth2Priority Value Object
 *
 * Priority level for oauth2 tasks.
 */

export class Oauth2Priority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): Oauth2Priority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new Oauth2Priority(value, label);
  }

  static low(): Oauth2Priority {
    return new Oauth2Priority(1, 'low');
  }
  static medium(): Oauth2Priority {
    return new Oauth2Priority(5, 'medium');
  }
  static high(): Oauth2Priority {
    return new Oauth2Priority(8, 'high');
  }
  static critical(): Oauth2Priority {
    return new Oauth2Priority(10, 'critical');
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

  isHigherThan(other: Oauth2Priority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: Oauth2Priority): boolean {
    return this.value < other.value;
  }

  equals(other: Oauth2Priority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
