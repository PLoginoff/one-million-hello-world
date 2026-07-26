/**
 * ContractTestingTimeWindow Value Object
 *
 * Time window for contract-testing operations.
 */

export class ContractTestingTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): ContractTestingTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new ContractTestingTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): ContractTestingTimeWindow {
    return new ContractTestingTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): ContractTestingTimeWindow {
    return new ContractTestingTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: ContractTestingTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: ContractTestingTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
