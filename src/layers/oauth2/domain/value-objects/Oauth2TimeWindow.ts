/**
 * Oauth2TimeWindow Value Object
 *
 * Time window for oauth2 operations.
 */

export class Oauth2TimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): Oauth2TimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new Oauth2TimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): Oauth2TimeWindow {
    return new Oauth2TimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): Oauth2TimeWindow {
    return new Oauth2TimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: Oauth2TimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: Oauth2TimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
