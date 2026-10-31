/**
 * Multipart Response Writer — `multipart/mixed` response serializer.
 *
 * Serializes heterogeneous parts (JSON + binary + text) into a single
 * RFC 2046 §5.1 multipart body with a caller-supplied or generated
 * boundary. The writer:
 *
 *   - validates that the boundary never occurs inside a part body
 *     (the one hard correctness rule of multipart encoding),
 *   - emits per-part headers (Content-Type, Content-Disposition,
 *     arbitrary extras), and
 *   - produces a single `Uint8Array` body plus the `Content-Type`
 *     header value (`multipart/mixed; boundary=...`).
 *
 * Complexity: O(total body bytes) — one pass to check boundary
 * collisions, one pass to concatenate.
 *
 * @module ControllerLayer/Engine
 */

import { MultipartPart, MultipartResponse } from './streaming-types';

const CRLF = '\r\n';

/** Raised when a part body contains the boundary marker. */
export class BoundaryCollisionError extends Error {
  constructor(boundary: string) {
    super(`Multipart boundary '${boundary}' occurs inside a part body`);
    this.name = 'BoundaryCollisionError';
  }
}

/** Options for {@link MultipartWriter}. */
export interface MultipartWriterOptions {
  /** Explicit boundary. Auto-generated when omitted. */
  readonly boundary?: string;
  /** Subtype — `mixed` (default), `related`, `form-data`, ... */
  readonly subtype?: string;
}

/**
 * Multipart serializer.
 *
 * Boundary generation: `----omhw-<random-hex>` — long enough that
 * collisions are essentially impossible, and the collision check
 * below guarantees correctness even when the caller picks a bad one.
 */
export class MultipartWriter {
  private readonly _boundary: string;
  private readonly _subtype: string;
  private readonly _parts: MultipartPart[];

  constructor(options?: MultipartWriterOptions) {
    this._boundary = options?.boundary ?? generateBoundary();
    this._subtype = options?.subtype ?? 'mixed';
    this._parts = [];
  }

  get boundary(): string {
    return this._boundary;
  }

  get partCount(): number {
    return this._parts.length;
  }

  /** Append a part. Order is preserved on the wire. */
  addPart(part: MultipartPart): this {
    this._parts.push(part);
    return this;
  }

  /** Append several parts. */
  addParts(parts: readonly MultipartPart[]): this {
    for (const p of parts) {
      this._parts.push(p);
    }
    return this;
  }

  /**
   * Serialize to wire bytes.
   *
   * Wire shape per part:
   *   `--<boundary>` CRLF
   *   `Content-Type: <ct>` CRLF
   *   [`Content-Disposition: <cd>` CRLF]
   *   [`X-K: v` CRLF]*
   *   CRLF
   *   `<body bytes>` CRLF
   * Final: `--<boundary>--` CRLF
   */
  serialize(): MultipartResponse {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];

    for (const part of this._parts) {
      const body = typeof part.body === 'string' ? encoder.encode(part.body) : part.body;
      this.assertNoCollision(body);

      chunks.push(encoder.encode(`--${this._boundary}${CRLF}`));
      chunks.push(encoder.encode(`Content-Type: ${part.contentType}${CRLF}`));
      if (part.contentDisposition !== undefined) {
        chunks.push(encoder.encode(`Content-Disposition: ${part.contentDisposition}${CRLF}`));
      }
      for (const [k, v] of Object.entries(part.headers ?? {})) {
        chunks.push(encoder.encode(`${k}: ${v}${CRLF}`));
      }
      chunks.push(encoder.encode(CRLF));
      chunks.push(body);
      chunks.push(encoder.encode(CRLF));
    }
    chunks.push(encoder.encode(`--${this._boundary}--${CRLF}`));

    return {
      contentType: `multipart/${this._subtype}; boundary=${this._boundary}`,
      boundary: this._boundary,
      body: concatBytes(chunks),
      partCount: this._parts.length,
    };
  }

  /**
   * The one hard rule: the delimiter `--boundary` must never occur
   * inside a body — RFC 2046 parsers split on it, so a collision would
   * corrupt the stream. When found, callers must re-roll the boundary.
   */
  private assertNoCollision(body: Uint8Array): void {
    const marker = new TextEncoder().encode(`--${this._boundary}`);
    if (indexOfBytes(body, marker) >= 0) {
      throw new BoundaryCollisionError(this._boundary);
    }
  }
}

// ---------------------------------------------------------------------------
// Byte helpers (self-contained — no Buffer dependency)
// ---------------------------------------------------------------------------

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) {
    total += c.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Naive substring scan — bodies are small enough that Boyer-Moore isn't worth it. */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function generateBoundary(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return `----omhw-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
