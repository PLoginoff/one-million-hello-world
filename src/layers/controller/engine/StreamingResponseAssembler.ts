/**
 * Streaming Response Assembler — unified writer over the stream
 * primitives.
 *
 * One facade a controller uses to emit a *response body* without
 * knowing the transport: `write()` buffers into a bounded queue,
 * `writeEvent()` formats an SSE frame, `writePart()` emits a multipart
 * section, and `drain()` hands the transport everything queued so far.
 *
 * The assembler enforces two invariants the raw pieces can't:
 *
 *   1. **One shape per response** — mixing `writePart` with plain
 *      `write` (or SSE frames) is a protocol violation; the first
 *      mode wins and the rest throw `MixedModeError`.
 *   2. **Bounded memory** — the internal queue shares the
 *      {@link BoundedChunkStream} capacity contract, so a slow
 *      transport applies backpressure to the producer instead of
 *      growing the heap.
 *
 * Mode is detected lazily on first call — an assembler that never
 * writes produces an empty body with whatever `Content-Type` the
 * caller sets.
 *
 * @module ControllerLayer/Engine
 */

import { MultipartWriter } from './MultipartWriter';
import { encodeSseFrame } from './SseController';
import { BoundedChunkStream } from './RequestStreamer';
import { MultipartPart, ServerSentEvent, WriteResult } from './streaming-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Response body modes — mutually exclusive. */
export type AssemblerMode = 'raw' | 'sse' | 'multipart';

/** Raised when a write mixes body modes. */
export class MixedModeError extends Error {
  constructor(expected: AssemblerMode, attempted: AssemblerMode) {
    super(`StreamingResponseAssembler: cannot ${attempted}-write into a ${expected} response`);
    this.name = 'MixedModeError';
  }
}

/** Options for {@link StreamingResponseAssembler}. */
export interface AssemblerOptions {
  /** Buffer capacity in bytes (bounded backpressure). */
  readonly capacity: number;
  /** Explicit mode — locked at construction; 'auto' infers on first write. */
  readonly mode?: AssemblerMode | 'auto';
  /** Multipart subtype (when mode='multipart'). */
  readonly multipartSubtype?: string;
  /** SSE retry hint for emitted events. */
  readonly sseRetryMs?: number;
}

/** Finalized response — body bytes + negotiated Content-Type. */
export interface AssembledResponse {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly mode: AssemblerMode;
  readonly bytesWritten: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Unified response writer.
 *
 * Transport pulls via `drain()`; producer pushes via the mode-specific
 * writers. `finish()` returns the assembled result when the response
 * is fully buffered (small responses) — streaming transports ignore
 * `finish` and drain incrementally.
 */
export class StreamingResponseAssembler {
  private readonly _stream: BoundedChunkStream;
  private _mode: AssemblerMode | 'auto';
  private readonly _multipartSubtype?: string;
  private readonly _sseRetryMs?: number;
  private _multipart: MultipartWriter | null;
  private _bytesWritten: number;
  private _finished: boolean;
  private _explicitContentType: string | null;

  constructor(options: AssemblerOptions) {
    this._stream = new BoundedChunkStream({ capacity: options.capacity });
    this._mode = options.mode ?? 'auto';
    this._multipartSubtype = options.multipartSubtype;
    this._sseRetryMs = options.sseRetryMs;
    this._multipart = null;
    this._bytesWritten = 0;
    this._finished = false;
    this._explicitContentType = null;
  }

  /** Current mode — 'auto' until the first specialized write. */
  get mode(): AssemblerMode | 'auto' {
    return this._mode;
  }

  /** Whether `finish()` was called. */
  get finished(): boolean {
    return this._finished;
  }

  /** Bytes written so far. */
  get bytesWritten(): number {
    return this._bytesWritten;
  }

  /** Set an explicit Content-Type (raw mode, or override). */
  contentType(ct: string): this {
    this._explicitContentType = ct;
    return this;
  }

  // ------------------------------------------------------------------
  // Raw writes
  // ------------------------------------------------------------------

  /** Write raw bytes — locks mode to 'raw'. */
  write(chunk: Uint8Array): WriteResult {
    this.enterMode('raw');
    if (this._finished) {
      return { kind: 'closed' };
    }
    const res = this._stream.write(chunk);
    if (res.kind === 'accepted') {
      this._bytesWritten += chunk.length;
    }
    return res;
  }

  /** Write a UTF-8 string. */
  writeText(text: string): WriteResult {
    return this.write(new TextEncoder().encode(text));
  }

  // ------------------------------------------------------------------
  // SSE writes
  // ------------------------------------------------------------------

  /** Emit an SSE frame — locks mode to 'sse'. */
  writeEvent(event: ServerSentEvent): WriteResult {
    this.enterMode('sse');
    if (this._finished) {
      return { kind: 'closed' };
    }
    const ev: ServerSentEvent =
      event.retry === undefined && this._sseRetryMs !== undefined
        ? { ...event, retry: this._sseRetryMs }
        : event;
    const frame = encodeSseFrame([ev]);
    const res = this._stream.write(frame.bytes);
    if (res.kind === 'accepted') {
      this._bytesWritten += frame.bytes.length;
    }
    return res;
  }

  /** SSE keepalive comment. */
  heartbeat(comment = 'hb'): WriteResult {
    return this.writeEvent({ comment, data: '' });
  }

  // ------------------------------------------------------------------
  // Multipart writes
  // ------------------------------------------------------------------

  /** Emit a multipart section — locks mode to 'multipart'. */
  writePart(part: MultipartPart): WriteResult {
    this.enterMode('multipart');
    if (this._finished) {
      return { kind: 'closed' };
    }
    if (this._multipart === null) {
      this._multipart = new MultipartWriter({ subtype: this._multipartSubtype });
      // Emit the opening boundary lazily on the FIRST part — a
      // multipart with zero parts is still legal.
      const head = new TextEncoder().encode(`--${this._multipart.boundary}\r\n`);
      this._stream.write(head);
      this._bytesWritten += head.length;
    }
    // Serialize one part by writing a single-part doc and stripping
    // the leading boundary line (we already emitted it) and the
    // closing marker.
    const doc = new MultipartWriter({ boundary: this._multipart.boundary, subtype: this._multipartSubtype });
    doc.addPart(part);
    const full = doc.serialize().body;
    const headLen = `--${this._multipart.boundary}\r\n`.length;
    const tail = new TextEncoder().encode(`--${this._multipart.boundary}--\r\n`);
    const body = full.slice(headLen, full.length - tail.length);
    const res = this._stream.write(body);
    if (res.kind === 'accepted') {
      this._bytesWritten += body.length;
    }
    return res;
  }

  // ------------------------------------------------------------------
  // Drain + finish
  // ------------------------------------------------------------------

  /** Drain everything queued for transport flush. */
  drain(): Uint8Array[] {
    return this._stream.drain();
  }

  /**
   * Finalize: close the stream and return the assembled response.
   * Multipart mode emits the closing boundary; SSE/raw are already
   * complete. Callers that streamed incrementally get a final frame —
   * the returned `body` is whatever remains in the buffer.
   */
  finish(): AssembledResponse {
    if (this._finished) {
      return this.assemble();
    }
    this._finished = true;

    if (this._mode === 'multipart' && this._multipart !== null) {
      const tail = new TextEncoder().encode(`--${this._multipart.boundary}--\r\n`);
      this._stream.write(tail);
      this._bytesWritten += tail.length;
    }
    this._stream.close();
    return this.assemble();
  }

  private assemble(): AssembledResponse {
    const remaining = this._stream.drain();
    const total = remaining.reduce((n, c) => n + c.length, 0);
    const body = new Uint8Array(total);
    let off = 0;
    for (const c of remaining) {
      body.set(c, off);
      off += c.length;
    }
    return {
      body,
      contentType: this._explicitContentType ?? this.inferContentType(),
      mode: this._mode === 'auto' ? 'raw' : this._mode,
      bytesWritten: this._bytesWritten,
    };
  }

  private inferContentType(): string {
    switch (this._mode) {
      case 'sse':
        return 'text/event-stream';
      case 'multipart':
        return `multipart/${this._multipartSubtype ?? 'mixed'}; boundary=${this._multipart?.boundary ?? ''}`;
      default:
        return 'application/octet-stream';
    }
  }

  private enterMode(mode: AssemblerMode): void {
    if (this._mode === 'auto') {
      this._mode = mode;
      return;
    }
    if (this._mode !== mode) {
      throw new MixedModeError(this._mode, mode);
    }
  }
}
