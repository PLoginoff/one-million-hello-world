/**
 * CdnIntegrationTimeWindow Value Object
 *
 * Time window for cdn-integration operations.
 */

export class CdnIntegrationTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): CdnIntegrationTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new CdnIntegrationTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): CdnIntegrationTimeWindow {
    return new CdnIntegrationTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): CdnIntegrationTimeWindow {
    return new CdnIntegrationTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: CdnIntegrationTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: CdnIntegrationTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
