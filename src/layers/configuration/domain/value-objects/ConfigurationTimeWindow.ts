/**
 * ConfigurationTimeWindow Value Object
 *
 * Time window for configuration operations.
 */

export class ConfigurationTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): ConfigurationTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new ConfigurationTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): ConfigurationTimeWindow {
    return new ConfigurationTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): ConfigurationTimeWindow {
    return new ConfigurationTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: ConfigurationTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: ConfigurationTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
