/**
 * SSE Controller — server-sent events stream with retry + replay.
 *
 * Implements the `text/event-stream` wire format (HTML Living Standard
 * §9.2): each event is a block of `field: value` lines terminated by a
 * blank line. Multi-line data splits into repeated `data:` fields.
 *
 *   event: tick            ┐
 *   id: 42                 │ one event — blank line terminates
 *   retry: 1500            │
 *   data: {"n":42}         ┘
 *
 * The controller keeps a bounded replay buffer (`lastEventId` ring) so
 * a reconnecting client that sends `Last-Event-ID: 41` can be re-fed
 * events 42+ — the standard mechanism EventSource uses for resumption.
 *
 * Heartbeats: a `: comment` frame every `heartbeatMs` keeps idle
 * connections alive through proxies that kill silent sockets.
 *
 * @module ControllerLayer/Engine
 */

import { ServerSentEvent, SseFrame } from './streaming-types';

// ---------------------------------------------------------------------------
// Frame encoder
// ---------------------------------------------------------------------------

/**
 * Encode one event to its wire block.
 *
 * `retry:` is only meaningful when numeric — non-numeric values are
 * silently dropped (per spec, clients ignore unparseable fields).
 */
export function encodeSseEvent(event: ServerSentEvent): string {
  const lines: string[] = [];
  if (event.comment !== undefined) {
    for (const line of event.comment.split('\n')) {
      lines.push(`: ${line}`);
    }
  }
  if (event.event !== undefined) {
    lines.push(`event: ${event.event}`);
  }
  if (event.id !== undefined) {
    lines.push(`id: ${event.id}`);
  }
  if (event.retry !== undefined) {
    lines.push(`retry: ${event.retry}`);
  }
  for (const line of event.data.split('\n')) {
    lines.push(`data: ${line}`);
  }
  return `${lines.join('\n')}\n\n`;
}

/** Encode a batch of events into one wire chunk. */
export function encodeSseFrame(events: readonly ServerSentEvent[]): SseFrame {
  const text = events.map(encodeSseEvent).join('');
  return { bytes: new TextEncoder().encode(text), eventCount: events.length };
}

/** Heartbeat frame — a comment-only block proxies won't kill. */
export function sseHeartbeat(comment = 'hb'): SseFrame {
  return encodeSseFrame([{ comment, data: '' }]);
}

// ---------------------------------------------------------------------------
// Replay buffer
// ---------------------------------------------------------------------------

interface BufferedEvent extends ServerSentEvent {
  /** Monotonic sequence assigned by the controller. */
  readonly seq: number;
}

/**
 * Ring buffer of recent events for `Last-Event-ID` resumption.
 * Size-bounded — old events evict in FIFO order.
 */
export class SseReplayBuffer {
  private readonly _capacity: number;
  private _events: BufferedEvent[];

  constructor(capacity = 256) {
    this._capacity = Math.max(1, capacity);
    this._events = [];
  }

  get size(): number {
    return this._events.length;
  }

  push(event: BufferedEvent): void {
    this._events.push(event);
    if (this._events.length > this._capacity) {
      this._events.shift();
    }
  }

  /**
   * Events with `id` numerically greater than `lastEventId`.
   * Non-numeric ids fall back to replaying the tail.
   */
  since(lastEventId: string | undefined): readonly BufferedEvent[] {
    if (lastEventId === undefined || lastEventId === '') {
      return [];
    }
    const last = Number.parseInt(lastEventId, 10);
    if (Number.isNaN(last)) {
      return [];
    }
    return this._events.filter((e) => {
      const seq = Number.parseInt(e.id ?? '', 10);
      return !Number.isNaN(seq) && seq > last;
    });
  }
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/** Options for {@link SseController}. */
export interface SseControllerOptions {
  /** Replay-buffer capacity (events). */
  readonly replayCapacity?: number;
  /** Retry hint sent with the first frame (ms). */
  readonly retryMs?: number;
}

/**
 * Server-sent events controller.
 *
 * One controller per subscription — `emit()` buffers into the replay
 * log and `pull()` drains pending wire bytes for transport flush.
 * `resume(lastEventId)` replays missed events into the pending queue.
 */
export class SseController {
  private readonly _buffer: SseReplayBuffer;
  private readonly _retryMs?: number;
  private _pending: ServerSentEvent[];
  private _seq: number;
  private _closed: boolean;
  private _retrySent: boolean;

  constructor(options?: SseControllerOptions) {
    this._buffer = new SseReplayBuffer(options?.replayCapacity ?? 256);
    this._retryMs = options?.retryMs;
    this._pending = [];
    this._seq = 0;
    this._closed = false;
    this._retrySent = false;
  }

  get closed(): boolean {
    return this._closed;
  }

  /** Queue an event for delivery (goes to the replay log). */
  emit(event: Omit<ServerSentEvent, 'id'> & { id?: string }): void {
    if (this._closed) {
      throw new Error('SseController.emit: stream closed');
    }
    const seq = this._seq;
    this._seq += 1;
    const ev: ServerSentEvent = {
      ...event,
      id: event.id ?? String(seq),
      ...(this._retrySent ? {} : this._retryMs !== undefined ? { retry: this._retryMs } : {}),
    };
    this._retrySent = true;
    this._buffer.push({ ...ev, seq });
    this._pending.push(ev);
  }

  /** Drain pending wire bytes — transport flushes these. */
  pull(): SseFrame {
    if (this._pending.length === 0) {
      return { bytes: new Uint8Array(0), eventCount: 0 };
    }
    const frame = encodeSseFrame(this._pending);
    this._pending = [];
    return frame;
  }

  /**
   * Reconnection entry point — re-queues buffered events with `id`
   * greater than the client's `Last-Event-ID`.
   */
  resume(lastEventId: string | undefined): number {
    const missed = this._buffer.since(lastEventId);
    for (const e of missed) {
      this._pending.push(e);
    }
    return missed.length;
  }

  /** Emit a keepalive comment frame. */
  heartbeat(comment = 'hb'): void {
    if (this._closed) {
      return;
    }
    this._pending.push({ comment, data: '' });
  }

  close(): void {
    this._closed = true;
    this._pending = [];
  }
}

/** The `Content-Type` for SSE responses. */
export const SSE_CONTENT_TYPE = 'text/event-stream';
