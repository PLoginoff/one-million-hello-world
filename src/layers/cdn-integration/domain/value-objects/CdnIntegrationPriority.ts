/**
 * CdnIntegrationPriority Value Object
 *
 * Priority level for cdn-integration tasks.
 */

export class CdnIntegrationPriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): CdnIntegrationPriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new CdnIntegrationPriority(value, label);
  }

  static low(): CdnIntegrationPriority {
    return new CdnIntegrationPriority(1, 'low');
  }
  static medium(): CdnIntegrationPriority {
    return new CdnIntegrationPriority(5, 'medium');
  }
  static high(): CdnIntegrationPriority {
    return new CdnIntegrationPriority(8, 'high');
  }
  static critical(): CdnIntegrationPriority {
    return new CdnIntegrationPriority(10, 'critical');
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

  isHigherThan(other: CdnIntegrationPriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: CdnIntegrationPriority): boolean {
    return this.value < other.value;
  }

  equals(other: CdnIntegrationPriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
