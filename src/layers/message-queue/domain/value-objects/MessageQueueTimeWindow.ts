/**
 * MessageQueueTimeWindow Value Object
 *
 * Time window for message-queue operations.
 */

export class MessageQueueTimeWindow {
  readonly startMs: number;
  readonly durationMs: number;

  private constructor(startMs: number, durationMs: number) {
    this.startMs = startMs;
    this.durationMs = durationMs;
  }

  static create(startMs: number, durationMs: number): MessageQueueTimeWindow {
    if (durationMs <= 0) {
      throw new Error('Time window duration must be positive');
    }
    return new MessageQueueTimeWindow(startMs, durationMs);
  }

  static fromMinutes(minutes: number): MessageQueueTimeWindow {
    return new MessageQueueTimeWindow(Date.now(), minutes * 60 * 1000);
  }

  static fromSeconds(seconds: number): MessageQueueTimeWindow {
    return new MessageQueueTimeWindow(Date.now(), seconds * 1000);
  }

  get endMs(): number {
    return this.startMs + this.durationMs;
  }

  contains(timestamp: number): boolean {
    return timestamp >= this.startMs && timestamp <= this.endMs;
  }

  overlaps(other: MessageQueueTimeWindow): boolean {
    return this.startMs < other.endMs && other.startMs < this.endMs;
  }

  equals(other: MessageQueueTimeWindow): boolean {
    return this.startMs === other.startMs && this.durationMs === other.durationMs;
  }

  toString(): string {
    return '[' + this.startMs + ', ' + this.endMs + ']';
  }
}
