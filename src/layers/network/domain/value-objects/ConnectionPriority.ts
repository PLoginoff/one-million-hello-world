/**
 * Connection Priority Value Object
 * 
 * Represents the priority level for connection resource allocation.
 */

export enum ConnectionPriorityEnum {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export class ConnectionPriority {
  readonly value: ConnectionPriorityEnum;
  readonly weight: number;

  private constructor(value: ConnectionPriorityEnum, weight: number) {
    this.value = value;
    this.weight = weight;
  }

  /**
   * Create low priority
   */
  static low(): ConnectionPriority {
    return new ConnectionPriority(ConnectionPriorityEnum.LOW, 1);
  }

  /**
   * Create normal priority
   */
  static normal(): ConnectionPriority {
    return new ConnectionPriority(ConnectionPriorityEnum.NORMAL, 5);
  }

  /**
   * Create high priority
   */
  static high(): ConnectionPriority {
    return new ConnectionPriority(ConnectionPriorityEnum.HIGH, 10);
  }

  /**
   * Create critical priority
   */
  static critical(): ConnectionPriority {
    return new ConnectionPriority(ConnectionPriorityEnum.CRITICAL, 20);
  }

  /**
   * Create from enum
   */
  static from(value: ConnectionPriorityEnum): ConnectionPriority {
    const weights: Map<ConnectionPriorityEnum, number> = new Map([
      [ConnectionPriorityEnum.LOW, 1],
      [ConnectionPriorityEnum.NORMAL, 5],
      [ConnectionPriorityEnum.HIGH, 10],
      [ConnectionPriorityEnum.CRITICAL, 20],
    ]);
    return new ConnectionPriority(value, weights.get(value) || 5);
  }

  /**
   * Create from numeric value
   */
  static fromNumber(value: number): ConnectionPriority {
    if (value <= 0) return ConnectionPriority.low();
    if (value <= 1) return ConnectionPriority.normal();
    if (value <= 2) return ConnectionPriority.high();
    return ConnectionPriority.critical();
  }

  /**
   * Check if is low priority
   */
  isLow(): boolean {
    return this.value === ConnectionPriorityEnum.LOW;
  }

  /**
   * Check if is normal priority
   */
  isNormal(): boolean {
    return this.value === ConnectionPriorityEnum.NORMAL;
  }

  /**
   * Check if is high priority
   */
  isHigh(): boolean {
    return this.value === ConnectionPriorityEnum.HIGH;
  }

  /**
   * Check if is critical priority
   */
  isCritical(): boolean {
    return this.value === ConnectionPriorityEnum.CRITICAL;
  }

  /**
   * Check if is higher than another priority
   */
  isHigherThan(other: ConnectionPriority): boolean {
    return this.value > other.value;
  }

  /**
   * Check if is lower than another priority
   */
  isLowerThan(other: ConnectionPriority): boolean {
    return this.value < other.value;
  }

  /**
   * Check if equals another priority
   */
  equals(other: ConnectionPriority): boolean {
    return this.value === other.value;
  }

  /**
   * Get numeric value for comparison
   */
  toNumber(): number {
    return this.value;
  }

  /**
   * Get weight for resource allocation
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Get string representation
   */
  toString(): string {
    return String(this.value);
  }

  /**
   * Get name of priority
   */
  getName(): string {
    return String(this.value).toLowerCase();
  }
}
