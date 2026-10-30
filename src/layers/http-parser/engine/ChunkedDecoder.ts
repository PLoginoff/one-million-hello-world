/**
 * ChunkedDecoder — incremental Transfer-Encoding: chunked decoder
 * (RFC 9112 §7.1) with trailer-section support.
 *
 * Wire format per chunk:
 *   `<hex-size>[;ext=val]... \r\n <data> \r\n`
 * terminating in `0 [;ext] \r\n [trailer-headers] \r\n`.
 *
 * The decoder is a small state machine over a byte buffer —
 *   SIZE_LINE → DATA → DATA_CRLF → (SIZE_LINE | TRAILERS) → DONE
 * — fed by arbitrary TCP segmentations. Like every streaming parser
 * in this engine, it never assumes feed boundaries mean anything.
 *
 * Three validations that matter:
 *  - The chunk-size line is hex digits, optionally followed by `;`
 *    chunk-extensions (which we parse-and-discard). Garbage → error.
 *  - After DATA the next two bytes MUST be CRLF; a missing CRLF is
 *    desync evidence (request smuggling exploits this exact spot).
 *  - Trailer section headers are parsed like a normal block and can
 *    be whitelisted via `allowedTrailers` — servers that forward
 *    trailers to backends must not pass attacker-controlled fields.
 *
 * Limits: `maxChunkSizeLineBytes` caps the size line (defends against
 * a peer streaming megabytes of hex); `maxTotalBytes` caps decoded
 * output — enforced mid-stream, not after buffering.
 *
 * Complexity: O(n) input bytes; each feed does a bounded amount of
 * linear scanning.
 *
 * @module HttpParserLayer/Engine
 */

import {
  ChunkedCallbacks,
  ChunkedDecoderOptions,
  ChunkedEncodingError,
} from './types';
import { parseHeaderBlock } from './MultipartParser';

const State = {
  SIZE_LINE: 0,
  DATA: 1,
  DATA_CRLF: 2,
  TRAILERS: 3,
  DONE: 4,
} as const;

const STATE_NAMES: Record<number, string> = {
  0: 'SIZE_LINE',
  1: 'DATA',
  2: 'DATA_CRLF',
  3: 'TRAILERS',
  4: 'DONE',
};

const CR = 0x0d;
const LF = 0x0a;
const SEMI = 0x3b;

function isHex(b: number): boolean {
  return (
    (b >= 0x30 && b <= 0x39) || // 0-9
    (b >= 0x41 && b <= 0x46) || // A-F
    (b >= 0x61 && b <= 0x66) // a-f
  );
}

function hexVal(b: number): number {
  if (b >= 0x30 && b <= 0x39) return b - 0x30;
  if (b >= 0x41 && b <= 0x46) return b - 0x41 + 10;
  return b - 0x61 + 10;
}

export class ChunkedDecoder {
  private readonly _callbacks: ChunkedCallbacks;
  private readonly _maxSizeLine: number;
  private readonly _maxTotal: number;
  private readonly _allowedTrailers: ReadonlySet<string> | undefined;

  private _buf: number[];
  private _state: number;
  /** Bytes remaining in the current chunk's DATA phase. */
  private _remaining: number;
  /** Bytes decoded (sum of DATA phases). */
  private _decoded: number;
  private _chunks: number;

  constructor(options: ChunkedDecoderOptions = {}, callbacks: ChunkedCallbacks = {}) {
    this._callbacks = callbacks;
    this._maxSizeLine = Math.max(16, options.maxChunkSizeLineBytes ?? 8_192);
    this._maxTotal = Math.max(0, options.maxTotalBytes ?? 0);
    this._allowedTrailers = options.allowedTrailers;

    this._buf = [];
    this._state = State.SIZE_LINE;
    this._remaining = 0;
    this._decoded = 0;
    this._chunks = 0;
  }

  get done(): boolean {
    return this._state === State.DONE;
  }

  get state(): string {
    return STATE_NAMES[this._state];
  }

  get chunksSeen(): number {
    return this._chunks;
  }

  get bytesDecoded(): number {
    return this._decoded;
  }

  /**
   * Feed wire bytes. Emits `onData` per complete chunk, `onTrailers`
   * once the terminal block parses, `onComplete` after the final
   * CRLF. Post-DONE bytes are ignored (connection may be reused).
   */
  feed(chunk: Uint8Array): void {
    if (this._state === State.DONE) {
      return;
    }
    for (let i = 0; i < chunk.byteLength; i++) {
      this._buf.push(chunk[i]);
    }
    this._run();
  }

  /** End-of-stream: a chunked body must end at DONE. */
  finish(): void {
    if (this._state !== State.DONE) {
      throw new ChunkedEncodingError(
        `stream ended mid-chunked-body in state ${STATE_NAMES[this._state]}`
      );
    }
  }

  /* ---------------------------------------------------------------- */
  /* State machine                                                     */
  /* ---------------------------------------------------------------- */

  private _run(): void {
    for (;;) {
      switch (this._state) {
        case State.SIZE_LINE:
          if (!this._readSizeLine()) {
            return;
          }
          break;

        case State.DATA:
          if (this._buf.length < this._remaining) {
            // Emit what we have — chunk data doesn't need to arrive in
            // one feed, and holding it adds latency for no benefit.
            const n = this._buf.length;
            if (n > 0) {
              this._emitData(n);
            }
            return;
          }
          this._emitData(this._remaining);
          break;

        case State.DATA_CRLF:
          if (this._buf.length < 2) {
            return;
          }
          if (this._buf[0] !== CR || this._buf[1] !== LF) {
            throw new ChunkedEncodingError(
              'expected CRLF after chunk data — possible request desync'
            );
          }
          this._buf.splice(0, 2);
          this._state = State.SIZE_LINE;
          break;

        case State.TRAILERS:
          if (!this._readTrailers()) {
            return;
          }
          break;

        case State.DONE:
          return;
      }
    }
  }

  /**
   * Consume the `<hex>[;extensions]\r\n` size line. Returns false
   * while incomplete. On size 0, transitions to TRAILERS rather than
   * DATA — the zero-chunk carries no payload.
   */
  private _readSizeLine(): boolean {
    const eol = this._findCRLF();
    if (eol < 0) {
      if (this._buf.length > this._maxSizeLine) {
        throw new ChunkedEncodingError(
          `chunk-size line exceeded ${this._maxSizeLine} bytes`
        );
      }
      return false;
    }
    if (eol === 0) {
      throw new ChunkedEncodingError('empty chunk-size line');
    }
    if (eol > this._maxSizeLine) {
      throw new ChunkedEncodingError(
        `chunk-size line exceeded ${this._maxSizeLine} bytes`
      );
    }

    // Parse hex digits up to `;` (chunk extensions are discarded —
    // they're per-hop metadata we have no use for at this layer).
    let size = 0;
    let i = 0;
    for (; i < eol; i++) {
      const b = this._buf[i];
      if (b === SEMI) {
        break;
      }
      if (!isHex(b)) {
        throw new ChunkedEncodingError(
          `invalid character 0x${b.toString(16)} in chunk-size line`
        );
      }
      // Guard against hex overflow: cap at 2^31-1 — no sane chunk is
      // larger and it keeps `size` an exact integer.
      if (size > 0x7ff_ffff) {
        throw new ChunkedEncodingError('chunk size overflow');
      }
      size = size * 16 + hexVal(b);
    }
    if (i === 0) {
      throw new ChunkedEncodingError('chunk-size line has no hex digits');
    }
    // Validate extension tail is printable (not strictly required but
    // catches obvious desync: non-token bytes after `;`).
    for (; i < eol; i++) {
      const b = this._buf[i];
      if (b < 0x20 && b !== 0x09) {
        throw new ChunkedEncodingError(
          `control byte 0x${b.toString(16)} in chunk extensions`
        );
      }
    }

    this._buf.splice(0, eol + 2);

    if (size === 0) {
      this._state = State.TRAILERS;
      return true;
    }
    this._remaining = size;
    this._chunks++;
    this._state = State.DATA;
    return true;
  }

  /** Emit `n` bytes of chunk data and move to DATA_CRLF when done. */
  private _emitData(n: number): void {
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      data[i] = this._buf[i];
    }
    this._buf.splice(0, n);
    this._remaining -= n;
    this._decoded += n;
    if (this._maxTotal > 0 && this._decoded > this._maxTotal) {
      throw new ChunkedEncodingError(
        `decoded body exceeded maxTotalBytes ${this._maxTotal}`
      );
    }
    this._callbacks.onData?.(data);
    if (this._remaining === 0) {
      this._state = State.DATA_CRLF;
    }
  }

  /**
   * Consume the trailer section: header lines until a bare CRLF.
   * When no trailers are present the section is just `\r\n`.
   */
  private _readTrailers(): boolean {
    // Terminal CRLF alone (no trailers).
    if (this._buf.length >= 2 && this._buf[0] === CR && this._buf[1] === LF) {
      this._buf.splice(0, 2);
      this._complete(new Map());
      return true;
    }
    // Find CRLFCRLF terminating the trailer block.
    let i = 0;
    for (;;) {
      const eol = this._findCRLF(i);
      if (eol < 0) {
        return false; // trailer block incomplete
      }
      // Next line is the empty line → block ends at eol+2.
      const next = this._findCRLF(eol + 2);
      if (next === eol + 2) {
        const block = new Uint8Array(eol + 2);
        for (let j = 0; j <= eol + 1; j++) {
          block[j] = this._buf[j];
        }
        const trailers = parseHeaderBlock(block.subarray(0, eol));
        if (this._allowedTrailers) {
          for (const name of trailers.keys()) {
            if (!this._allowedTrailers.has(name)) {
              throw new ChunkedEncodingError(
                `trailer '${name}' not in allowedTrailers whitelist`
              );
            }
          }
        }
        this._buf.splice(0, eol + 4);
        this._complete(trailers);
        return true;
      }
      if (next < 0) {
        return false;
      }
      i = next;
    }
  }

  private _complete(trailers: Map<string, string>): void {
    this._state = State.DONE;
    this._callbacks.onTrailers?.(trailers);
    this._callbacks.onComplete?.();
  }

  /** Index of CR followed by LF at/after `from`, or -1. */
  private _findCRLF(from = 0): number {
    for (let i = from; i + 1 < this._buf.length; i++) {
      if (this._buf[i] === CR && this._buf[i + 1] === LF) {
        return i;
      }
    }
    return -1;
  }
}
