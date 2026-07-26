/**
 * AnomalyDetectionTimeWindow Value Object
 *
 * Time window for anomaly-detection operations.
 */

export class AnomalyDetectionTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): AnomalyDetectionTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new AnomalyDetectionTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): AnomalyDetectionTimeWindow {
    return new AnomalyDetectionTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): AnomalyDetectionTimeWindow {
    return new AnomalyDetectionTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: AnomalyDetectionTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: AnomalyDetectionTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
