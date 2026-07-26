/**
 * SsoTimeWindow Value Object
 *
 * Time window for sso operations.
 */

export class SsoTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): SsoTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new SsoTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): SsoTimeWindow {
    return new SsoTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): SsoTimeWindow {
    return new SsoTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: SsoTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: SsoTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
