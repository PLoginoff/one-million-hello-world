/**
 * PropertyTestingTimeWindow Value Object
 *
 * Time window for property-testing operations.
 */

export class PropertyTestingTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): PropertyTestingTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new PropertyTestingTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): PropertyTestingTimeWindow {
    return new PropertyTestingTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): PropertyTestingTimeWindow {
    return new PropertyTestingTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: PropertyTestingTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: PropertyTestingTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
