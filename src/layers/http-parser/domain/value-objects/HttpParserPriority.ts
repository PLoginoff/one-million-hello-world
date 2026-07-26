/**
 * HttpParserPriority Value Object
 *
 * Priority level for http-parser tasks.
 */

export class HttpParserPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): HttpParserPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new HttpParserPriority(value, label);
  }

  static low(): HttpParserPriority {
    return new HttpParserPriority(1, 'low');
  }
  static medium(): HttpParserPriority {
    return new HttpParserPriority(5, 'medium');
  }
  static high(): HttpParserPriority {
    return new HttpParserPriority(8, 'high');
  }
  static critical(): HttpParserPriority {
    return new HttpParserPriority(10, 'critical');
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

  isHigherThan(other: HttpParserPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: HttpParserPriority): boolean {
    return this.value < other.value;
  }

  equals(other: HttpParserPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
