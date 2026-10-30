/**
 * Transport Adapters — pluggable byte transports.
 *
 * Each adapter implements {@link ITransportAdapter} over an injected
 * `ByteSink`, translating transport-neutral writes into a wire format:
 *
 * - `LoopbackAdapter`      — in-memory pass-through; captures everything
 *                            for assertions; optional async drain
 *                            emulation via a drain threshold.
 * - `SocketStubAdapter`    — TCP-like: raw bytes, optional artificial
 *                            segment size and pause behavior.
 * - `ChunkedHttpAdapter`   — HTTP/1.1 `Transfer-Encoding: chunked`
 *                            writer: hex-length framing + trailers.
 * - `SseAdapter`           — Server-Sent Events writer: `data:` lines,
 *                            event/id fields, comment keep-alives.
 * - `WebSocketAdapter`     — RFC 6455 frame writer delegating to the
 *                            websocket layer's `FrameCodec` for real
 *                            wire encoding (fragmentation included).
 *
 * Backpressure model: adapters own a small internal pending-bytes
 * counter fed by the sink's `write` return value. When the sink says
 * "stop" (returns false) the adapter goes paused and forwards `false`;
 * the sink's `onDrain` resumes it. The engine's write queue sits on top
 * of this uniform contract.
 *
 * @module TransportLayer/Engine
 */

import {
  ByteSink,
  ITransportAdapter,
  TransportClosedError,
} from './types';
import { FrameCodec } from '../../websocket/protocol/FrameCodec';
import { WsOpcode } from '../../websocket/protocol/types';

const CRLF = '\r\n';
const encoder = new TextEncoder();

function utf8(s: string): Uint8Array {
  return encoder.encode(s);
}

/* ================================================================== */
/* Base                                                                */
/* ================================================================== */

/**
 * Shared lifecycle + backpressure plumbing. Concrete adapters override
 * `_encode` to translate a logical chunk into wire bytes.
 */
export abstract class BaseAdapter implements ITransportAdapter {
  abstract readonly name: string;

  protected readonly _sink: ByteSink;
  protected _open: boolean;
  protected _ended: boolean;
  protected _paused: boolean;
  protected _bytesWritten: number;
  private readonly _drainCbs: (() => void)[];

  constructor(sink: ByteSink) {
    this._sink = sink;
    this._open = false;
    this._ended = false;
    this._paused = false;
    this._bytesWritten = 0;
    this._drainCbs = [];
    sink.onDrain?.(() => this._handleDrain());
  }

  get open(): boolean {
    return this._open && !this._ended;
  }

  get bytesWritten(): number {
    return this._bytesWritten;
  }

  /** Whether the underlying sink is currently refusing bytes. */
  get paused(): boolean {
    return this._paused;
  }

  start(): void {
    this._open = true;
    this._ended = false;
  }

  /**
   * Translate a logical chunk into zero or more wire byte arrays.
   * Returning an empty array is legal (e.g. buffered format).
   */
  protected abstract _encode(chunk: Uint8Array): Uint8Array[];

  /** Bytes to emit when `end` is called (trailer block, close frame…). */
  protected abstract _encodeEnd(trailers?: Record<string, string>): Uint8Array[];

  write(chunk: Uint8Array): boolean {
    this._ensureWritable();
    if (chunk.byteLength === 0) {
      return !this._paused;
    }
    for (const out of this._encode(chunk)) {
      this._emit(out);
    }
    return !this._paused;
  }

  end(trailers?: Record<string, string>): void {
    this._ensureWritable();
    for (const out of this._encodeEnd(trailers)) {
      this._emit(out);
    }
    this._ended = true;
    this._sink.flush?.();
    this._sink.end?.();
  }

  abort(_reason?: string): void {
    this._ended = true;
    this._open = false;
  }

  onDrain(cb: () => void): void {
    this._drainCbs.push(cb);
  }

  protected _emit(bytes: Uint8Array): void {
    if (bytes.byteLength === 0) {
      return;
    }
    const accepted = this._sink.write(bytes);
    this._bytesWritten += bytes.byteLength;
    if (!accepted) {
      this._paused = true;
    }
  }

  protected _handleDrain(): void {
    if (!this._paused) {
      return;
    }
    this._paused = false;
    const cbs = this._drainCbs.splice(0);
    for (const cb of cbs) {
      cb();
    }
  }

  protected _ensureWritable(): void {
    if (this._ended || !this._open) {
      throw new TransportClosedError(this.name);
    }
  }
}

/* ================================================================== */
/* Loopback                                                            */
/* ================================================================== */

/**
 * In-memory pass-through — the byte-for-byte identity transport.
 * Primarily for tests and in-process channels; `received` mirrors the
 * sink's accumulated bytes through this adapter's own lens so tests can
 * assert on encoded content without reaching into the sink.
 */
export class LoopbackAdapter extends BaseAdapter {
  readonly name = 'loopback';
  private readonly _received: Uint8Array[] = [];

  protected _encode(chunk: Uint8Array): Uint8Array[] {
    this._received.push(chunk.slice());
    return [chunk];
  }

  protected _encodeEnd(_trailers?: Record<string, string>): Uint8Array[] {
    return [];
  }

  /** Concatenated copy of every byte seen (pre-sink view). */
  get received(): Uint8Array {
    const total = this._received.reduce((n, c) => n + c.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this._received) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  }

  get receivedText(): string {
    return new TextDecoder().decode(this.received);
  }
}

/* ================================================================== */
/* Socket stub                                                         */
/* ================================================================== */

export interface SocketStubOptions {
  /**
   * Maximum segment size: each logical write is split into segments of
   * at most this many bytes — models TCP segmentation. 0 = no split.
   */
  readonly segmentSize?: number;
}

/**
 * TCP-like socket stub: raw bytes on the wire, optional segmentation.
 * Segmentation exercises the engine's ability to deal with writes that
 * fragment differently than the logical chunks submitted.
 */
export class SocketStubAdapter extends BaseAdapter {
  readonly name = 'socket-stub';
  private readonly _segmentSize: number;

  constructor(sink: ByteSink, options: SocketStubOptions = {}) {
    super(sink);
    this._segmentSize = options.segmentSize ?? 0;
  }

  protected _encode(chunk: Uint8Array): Uint8Array[] {
    if (this._segmentSize <= 0 || chunk.byteLength <= this._segmentSize) {
      return [chunk];
    }
    const out: Uint8Array[] = [];
    for (let off = 0; off < chunk.byteLength; off += this._segmentSize) {
      out.push(chunk.subarray(off, Math.min(off + this._segmentSize, chunk.byteLength)));
    }
    return out;
  }

  protected _encodeEnd(_trailers?: Record<string, string>): Uint8Array[] {
    return [];
  }
}

/* ================================================================== */
/* HTTP/1.1 chunked                                                    */
/* ================================================================== */

/**
 * HTTP/1.1 `Transfer-Encoding: chunked` writer (RFC 9112 §7.1).
 *
 * Each logical chunk produces:
 *   <hex length> CRLF <bytes> CRLF
 * `end(trailers)` produces:
 *   0 CRLF [Name: value CRLF]* CRLF
 *
 * Trailer header names are validated (token chars) to keep wire output
 * well-formed; invalid names throw rather than emit garbage.
 */
export class ChunkedHttpAdapter extends BaseAdapter {
  readonly name = 'http-chunked';
  /** Max bytes per wire chunk; larger logical writes split. */
  private readonly _wireChunkSize: number;

  constructor(sink: ByteSink, wireChunkSize: number = 0) {
    super(sink);
    this._wireChunkSize = Math.max(0, wireChunkSize);
  }

  protected _encode(chunk: Uint8Array): Uint8Array[] {
    const parts: Uint8Array[] = [];
    if (this._wireChunkSize === 0 || chunk.byteLength <= this._wireChunkSize) {
      parts.push(this._frame(chunk));
      return parts;
    }
    for (let off = 0; off < chunk.byteLength; off += this._wireChunkSize) {
      parts.push(
        this._frame(chunk.subarray(off, Math.min(off + this._wireChunkSize, chunk.byteLength)))
      );
    }
    return parts;
  }

  protected _encodeEnd(trailers?: Record<string, string>): Uint8Array[] {
    let tail = `0${CRLF}`;
    if (trailers) {
      for (const [k, v] of Object.entries(trailers)) {
        if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(k)) {
          throw new TransportClosedError(`invalid trailer name '${k}'`);
        }
        tail += `${k}: ${v}${CRLF}`;
      }
    }
    tail += CRLF;
    return [utf8(tail)];
  }

  private _frame(chunk: Uint8Array): Uint8Array {
    const header = utf8(`${chunk.byteLength.toString(16)}${CRLF}`);
    const tail = utf8(CRLF);
    const out = new Uint8Array(header.length + chunk.length + tail.length);
    out.set(header, 0);
    out.set(chunk, header.length);
    out.set(tail, header.length + chunk.length);
    return out;
  }
}

/* ================================================================== */
/* SSE                                                                 */
/* ================================================================== */

export interface SseEvent {
  /** Event payload; may contain newlines (multi data: lines). */
  readonly data: string;
  /** Named event type (`event:` field); default = message. */
  readonly event?: string;
  /** Last-Event-ID value (`id:` field) for replay. */
  readonly id?: string;
  /** Suggested retry interval (`retry:` field, ms). */
  readonly retry?: number;
}

/**
 * Server-Sent Events writer (HTML Living Standard §9.2).
 *
 * `sendEvent` emits a complete event block; `sendComment` emits a
 * `:…\n\n` keep-alive. `write(chunk)` treats bytes as UTF-8 `data`
 * lines for a default `message` event — convenient when streaming raw
 * payloads through the uniform adapter API.
 */
export class SseAdapter extends BaseAdapter {
  readonly name = 'sse';

  protected _encode(chunk: Uint8Array): Uint8Array[] {
    const text = new TextDecoder().decode(chunk);
    return [utf8(this._formatEvent({ data: text }))];
  }

  protected _encodeEnd(_trailers?: Record<string, string>): Uint8Array[] {
    return [];
  }

  /** Emit a fully-formed SSE event block. Returns writable status. */
  sendEvent(event: SseEvent): boolean {
    this._ensureWritable();
    this._emit(utf8(this._formatEvent(event)));
    return !this.paused;
  }

  /** Emit a `: comment` keep-alive line (proxies won't time out). */
  sendComment(comment: string): boolean {
    this._ensureWritable();
    // Sanitize: no CRLF inside a comment line.
    const safe = comment.replace(/[\r\n]/g, ' ');
    this._emit(utf8(`: ${safe}\n\n`));
    return !this.paused;
  }

  private _formatEvent(e: SseEvent): string {
    let out = '';
    if (e.event !== undefined) {
      out += `event: ${e.event}\n`;
    }
    if (e.id !== undefined) {
      out += `id: ${e.id}\n`;
    }
    if (e.retry !== undefined) {
      out += `retry: ${e.retry}\n`;
    }
    // Each newline in data becomes a new `data:` line per spec.
    for (const line of e.data.split('\n')) {
      out += `data: ${line}\n`;
    }
    return out + '\n';
  }
}

/* ================================================================== */
/* WebSocket                                                           */
/* ================================================================== */

export interface WebSocketAdapterOptions {
  /** Mask outgoing frames (client side). Default false (server). */
  readonly mask?: boolean;
  /** Fragment payloads larger than this into continuation frames. */
  readonly fragmentAt?: number;
  /** Binary vs text opcode for `write` calls. Default BINARY. */
  readonly opcode?: WsOpcode.TEXT | WsOpcode.BINARY;
}

/**
 * WebSocket frame writer. Delegates all wire encoding to the websocket
 * layer's `FrameCodec` (RFC 6455 §5) — real bit-level framing with
 * masking support and continuation-frame fragmentation.
 */
export class WebSocketAdapter extends BaseAdapter {
  readonly name = 'websocket';
  private readonly _mask: boolean;
  private readonly _fragmentAt: number;
  private readonly _opcode: WsOpcode.TEXT | WsOpcode.BINARY;

  constructor(sink: ByteSink, options: WebSocketAdapterOptions = {}) {
    super(sink);
    this._mask = options.mask ?? false;
    this._fragmentAt = options.fragmentAt ?? 0;
    this._opcode = options.opcode ?? WsOpcode.BINARY;
  }

  protected _encode(chunk: Uint8Array): Uint8Array[] {
    const buf = Buffer.from(chunk);
    if (this._fragmentAt <= 0 || chunk.byteLength <= this._fragmentAt) {
      return [
        new Uint8Array(
          FrameCodec.encode(this._opcode, buf, { mask: this._mask })
        ),
      ];
    }
    const frames = FrameCodec.fragment(
      this._opcode,
      buf,
      this._fragmentAt,
      this._mask
    );
    return frames.map((f) => new Uint8Array(f));
  }

  /** Send a text frame explicitly (real TEXT opcode). */
  sendText(text: string): boolean {
    this._ensureWritable();
    this._emit(new Uint8Array(FrameCodec.encodeText(text, this._mask)));
    return !this.paused;
  }

  /** Emit a close frame; `end()` without trailers does the same. */
  close(code: number = 1000, reason: string = ''): boolean {
    this._ensureWritable();
    this._emit(new Uint8Array(FrameCodec.encodeClose(code, reason, this._mask)));
    return !this.paused;
  }

  protected _encodeEnd(_trailers?: Record<string, string>): Uint8Array[] {
    // WebSocket has no trailers; end emits a normal close frame.
    return [new Uint8Array(FrameCodec.encodeClose(1000, '', this._mask))];
  }
}
