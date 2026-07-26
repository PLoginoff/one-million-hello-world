/**
 * DataQualityTimeWindow Value Object
 *
 * Time window for data-quality operations.
 */

export class DataQualityTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): DataQualityTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new DataQualityTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): DataQualityTimeWindow {
    return new DataQualityTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): DataQualityTimeWindow {
    return new DataQualityTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: DataQualityTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: DataQualityTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
