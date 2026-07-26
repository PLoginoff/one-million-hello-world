/**
 * EventSourcingTimeWindow Value Object
 *
 * Time window for event-sourcing operations.
 */

export class EventSourcingTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): EventSourcingTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new EventSourcingTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): EventSourcingTimeWindow {
    return new EventSourcingTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): EventSourcingTimeWindow {
    return new EventSourcingTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: EventSourcingTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: EventSourcingTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
