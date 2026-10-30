/**
 * MultipartParser — streaming multipart/form-data decoder (RFC 7578).
 *
 * The hard problem in multipart parsing is that the delimiter
 * `\r\n--BOUNDARY` can straddle any chunk boundary, and body bytes
 * can't be emitted until we *know* they aren't the start of a
 * boundary. This parser therefore keeps a holdback window: body data
 * is emitted only up to (buffer.length - boundaryBytes - 4), keeping
 * the last boundary+lookahead bytes until the next feed resolves
 * them. That's the standard streaming-multipart trick — emit only
 * provably-safe bytes.
 *
 * State machine:
 *   PREAMBLE      — bytes before the first `--boundary` are skipped
 *                   (RFC 7578 §4.2: preamble MUST be ignored).
 *   BOUNDARY_LINE — after a delimiter: `--` = final boundary, `\r\n`
 *                   = part headers follow.
 *   PART_HEADERS  — accumulate until `\r\n\r\n`; parse field lines.
 *   PART_BODY     — emit body bytes with holdback; on `\r\n--BOUND`
 *                   the part ends (the CRLF belongs to the delimiter,
 *                   NOT the body — a classic off-by-two).
 *   EPILOGUE      — after the final boundary everything is ignored.
 *
 * The CRLF-prefix attachment rule is the subtle bit of the spec: the
 * delimiter is `<CRLF>--<boundary>`; the first boundary has no CRLF
 * because there is no preceding body. This is why the body search
 * looks for the CRLF-prefixed form while the preamble search looks
 * for the bare form.
 *
 * Limits (`maxPartSize`, `maxTotalSize`, `maxParts`) throw mid-stream
 * rather than buffering first — a memory-bound parser is the whole
 * point of streaming.
 *
 * Complexity: O(n) over input bytes; the scan is a linear `indexOf`
 * over the unprocessed buffer, amortized by the holdback cut.
 *
 * @module HttpParserLayer/Engine
 */

import {
  MultipartCallbacks,
  MultipartError,
  MultipartOptions,
  MultipartPart,
} from './types';

const State = {
  PREAMBLE: 0,
  BOUNDARY_LINE: 1,
  PART_HEADERS: 2,
  PART_BODY: 3,
  EPILOGUE: 4,
} as const;

const STATE_NAMES: Record<number, string> = {
  0: 'PREAMBLE',
  1: 'BOUNDARY_LINE',
  2: 'PART_HEADERS',
  3: 'PART_BODY',
  4: 'EPILOGUE',
};

const CR = 0x0d;
const LF = 0x0a;
const DASH = 0x2d;
const SP = 0x20;
const TAB = 0x09;

/**
 * First index of `needle` in `hay` at/after `from`, or -1. Byte-level
 * search — no string decoding; boundary matching must be octet-exact
 * because bodies are binary.
 */
function indexOf(hay: Uint8Array, hayLen: number, needle: Uint8Array, from: number): number {
  const n = needle.length;
  if (n === 0) {
    return from;
  }
  const last = hayLen - n;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < n; j++) {
      if (hay[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

/** Parse `Content-Disposition` params: name / filename extraction. */
function parseContentDisposition(value: string): {
  name: string | null;
  filename: string | null;
} {
  let name: string | null = null;
  let filename: string | null = null;
  // Params are `;`-separated `key="value"` or `key=value`; quoted
  // strings may contain escaped quotes but multipart filenames
  // rarely exercise that — take the simple correct path.
  for (const seg of value.split(';')) {
    const eq = seg.indexOf('=');
    if (eq < 0) {
      continue;
    }
    const key = seg.slice(0, eq).trim().toLowerCase();
    let val = seg.slice(eq + 1).trim();
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (key === 'name') {
      name = val;
    } else if (key === 'filename' || key === 'filename*') {
      // filename* (RFC 5987 encoding) is treated as filename; full
      // charset decoding is the mime layer's job, not the framer's.
      filename = val;
    }
  }
  return { name, filename };
}

export class MultipartParser {
  private readonly _boundary: Uint8Array;       // `--` + boundary
  private readonly _delimiter: Uint8Array;      // `\r\n--` + boundary
  private readonly _crlfCrlf = new Uint8Array([CR, LF, CR, LF]);
  private readonly _callbacks: MultipartCallbacks;
  private readonly _maxPartSize: number;
  private readonly _maxTotalSize: number;
  private readonly _maxParts: number;

  /** Accumulation buffer: bytes received but not yet consumed. */
  private _buf: Uint8Array;
  private _len: number;
  private _state: number;
  private _partBytes: number;
  private _totalBytes: number;
  private _partCount: number;

  constructor(options: MultipartOptions, callbacks: MultipartCallbacks = {}) {
    if (!options.boundary || options.boundary.length === 0) {
      throw new MultipartError('boundary must be a non-empty string');
    }
    // Boundary is 7-bit by definition (RFC 2046 §5.1.1).
    const raw = new TextEncoder().encode(`--${options.boundary}`);
    this._boundary = raw;
    const delim = new Uint8Array(raw.length + 2);
    delim[0] = CR;
    delim[1] = LF;
    delim.set(raw, 2);
    this._delimiter = delim;

    this._callbacks = callbacks;
    this._maxPartSize = options.maxPartSize ?? 0;
    this._maxTotalSize = options.maxTotalSize ?? 0;
    this._maxParts = options.maxParts ?? 0;

    this._buf = new Uint8Array(8192);
    this._len = 0;
    this._state = State.PREAMBLE;
    this._partBytes = 0;
    this._totalBytes = 0;
    this._partCount = 0;
  }

  get state(): string {
    return STATE_NAMES[this._state];
  }

  get partsSeen(): number {
    return this._partCount;
  }

  get bytesConsumed(): number {
    return this._totalBytes;
  }

  get complete(): boolean {
    return this._state === State.EPILOGUE;
  }

  /**
   * Feed a chunk of the entity body. Preamble, boundaries, headers
   * and body bytes may all arrive in the same chunk or straddle
   * chunks — the holdback + state machine handles every split.
   */
  feed(chunk: Uint8Array): void {
    if (this._state === State.EPILOGUE) {
      return; // trailing bytes after final boundary are ignored
    }
    this._append(chunk);
    this._totalBytes += chunk.byteLength;
    if (this._maxTotalSize > 0 && this._totalBytes > this._maxTotalSize) {
      throw new MultipartError(
        `multipart body exceeded maxTotalSize ${this._maxTotalSize}`
      );
    }
    this._run();
  }

  /**
   * Signal end-of-body. A body that ends without the final boundary
   * is malformed — the state machine must be in EPILOGUE.
   */
  finish(): void {
    if (this._state !== State.EPILOGUE) {
      throw new MultipartError(
        `multipart body ended in state ${STATE_NAMES[this._state]} without final boundary`
      );
    }
  }

  /* ---------------------------------------------------------------- */
  /* State machine                                                     */
  /* ---------------------------------------------------------------- */

  /** Consume from `_buf` while progress can be made. */
  private _run(): void {
    for (;;) {
      switch (this._state) {
        case State.PREAMBLE: {
          // First boundary has no leading CRLF (RFC 7578 §4.2).
          const idx = indexOf(this._buf, this._len, this._boundary, 0);
          if (idx < 0) {
            // Hold back enough to catch a boundary split across feeds.
            const keep = this._boundary.length;
            if (this._len > keep) {
              this._consume(this._len - keep);
            }
            return;
          }
          this._consume(idx + this._boundary.length);
          this._state = State.BOUNDARY_LINE;
          break;
        }

        case State.BOUNDARY_LINE: {
          if (this._len < 2) {
            return; // need 2 bytes to decide `--` vs CRLF
          }
          if (this._buf[0] === DASH && this._buf[1] === DASH) {
            this._consume(2);
            this._state = State.EPILOGUE;
            this._consume(this._len); // trailing epilogue bytes
            this._callbacks.onComplete?.();
            return;
          }
          if (this._buf[0] === CR && this._buf[1] === LF) {
            this._consume(2);
            this._state = State.PART_HEADERS;
            break;
          }
          throw new MultipartError(
            `expected '--' or CRLF after boundary, got 0x${this._buf[0].toString(16)} 0x${this._buf[1].toString(16)}`
          );
        }

        case State.PART_HEADERS: {
          const end = indexOf(this._buf, this._len, this._crlfCrlf, 0);
          if (end < 0) {
            return; // headers incomplete — wait for more
          }
          const headerBytes = this._buf.slice(0, end);
          this._consume(end + this._crlfCrlf.length);
          this._emitPart(headerBytes);
          this._state = State.PART_BODY;
          this._partBytes = 0;
          break;
        }

        case State.PART_BODY: {
          const idx = indexOf(this._buf, this._len, this._delimiter, 0);
          if (idx >= 0) {
            // Everything before the CRLF-prefixed delimiter is body.
            this._emitData(this._buf.slice(0, idx));
            this._consume(idx + this._delimiter.length);
            this._callbacks.onPartEnd?.();
            this._partCount++;
            if (this._maxParts > 0 && this._partCount > this._maxParts) {
              throw new MultipartError(
                `multipart part count exceeded maxParts ${this._maxParts}`
              );
            }
            this._state = State.BOUNDARY_LINE;
            break;
          }
          // No boundary: emit all but the holdback window (delimiter
          // could start inside the last delimiter.length+2 bytes).
          const keep = this._delimiter.length + 2;
          const emitLen = this._len - keep;
          if (emitLen <= 0) {
            return;
          }
          this._emitData(this._buf.slice(0, emitLen));
          this._consume(emitLen);
          break; // loop: may reveal a delimiter after emitting
        }

        case State.EPILOGUE:
          return;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Emission                                                          */
  /* ---------------------------------------------------------------- */

  private _emitPart(headerBytes: Uint8Array): void {
    const headers = parseHeaderBlock(headerBytes);
    const disposition = headers.get('content-disposition') ?? '';
    const { name, filename } = parseContentDisposition(disposition);
    const part: MultipartPart = {
      headers,
      name,
      filename,
      contentType: headers.get('content-type') ?? 'text/plain',
    };
    this._callbacks.onPart?.(part);
  }

  private _emitData(bytes: Uint8Array): void {
    if (bytes.byteLength === 0) {
      return;
    }
    this._partBytes += bytes.byteLength;
    if (this._maxPartSize > 0 && this._partBytes > this._maxPartSize) {
      throw new MultipartError(
        `multipart part exceeded maxPartSize ${this._maxPartSize}`
      );
    }
    this._callbacks.onPartData?.(bytes);
  }

  /* ---------------------------------------------------------------- */
  /* Buffer management                                                 */
  /* ---------------------------------------------------------------- */

  private _append(chunk: Uint8Array): void {
    const need = this._len + chunk.byteLength;
    if (need > this._buf.byteLength) {
      // Grow geometrically — amortized O(1) append like ArrayList.
      let cap = this._buf.byteLength * 2;
      while (cap < need) {
        cap *= 2;
      }
      const next = new Uint8Array(cap);
      next.set(this._buf.subarray(0, this._len));
      this._buf = next;
    }
    this._buf.set(chunk, this._len);
    this._len += chunk.byteLength;
  }

  /** Drop the first `n` consumed bytes via memmove. */
  private _consume(n: number): void {
    if (n <= 0) {
      return;
    }
    this._buf.copyWithin(0, n, this._len);
    this._len -= n;
  }
}

/* ------------------------------------------------------------------ */
/* Header block parsing (shared small helper)                          */
/* ------------------------------------------------------------------ */

/**
 * Decode a `\r\n`-separated header block (the CRLFCRLF terminator
 * already stripped by the caller). Returns lower-cased names; later
 * duplicates overwrite earlier ones (multipart parts shouldn't carry
 * list headers — the part header set is tiny and flat by spec).
 */
export function parseHeaderBlock(bytes: Uint8Array): Map<string, string> {
  const headers = new Map<string, string>();
  const text = new TextDecoder('latin1').decode(bytes);
  let pos = 0;
  while (pos < text.length) {
    const end = text.indexOf('\r\n', pos);
    const line = end < 0 ? text.slice(pos) : text.slice(pos, end);
    pos = end < 0 ? text.length : end + 2;
    if (line.length === 0) {
      continue;
    }
    // obs-fold continuation: line begins with SP/TAB → append to prev.
    if ((line.charCodeAt(0) === SP || line.charCodeAt(0) === TAB) && headers.size > 0) {
      const lastKey = [...headers.keys()][headers.size - 1];
      headers.set(lastKey, `${headers.get(lastKey)} ${line.trim()}`);
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) {
      continue; // malformed line — skip rather than fail the whole part
    }
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers.set(name, value);
  }
  return headers;
}
