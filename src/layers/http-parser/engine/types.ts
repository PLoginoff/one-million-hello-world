/**
 * HTTP Parser Engine — shared types.
 *
 * Vocabulary:
 * - `ByteFeed`            — the incremental-parse contract: parsers
 *                           consume arbitrary TCP segmentations via
 *                           `feed(chunk)` and surface events, never
 *                           assuming chunk boundaries mean anything.
 * - `MultipartParser`     — streaming multipart/form-data decoder
 *                           (RFC 7578): boundary scanning, part
 *                           headers, per-part content dispatch.
 * - `ChunkedDecoder`      — Transfer-Encoding: chunked (RFC 9112
 *                           §7.1) including trailer parsing.
 * - `HeaderNormalizer`    — canonicalizes header names/values:
 *                           lower-casing, obs-fold unfolding,
 *                           duplicate merge rules.
 * - `UrlParser`           — WHATWG-ish URL decomposition plus a
 *                           structured query-string model.
 * - `BodySizeLimiter`     — mid-stream byte budget that aborts on
 *                           the exact chunk that crosses the limit.
 *
 * @module HttpParserLayer/Engine
 */

import { HttpParserError } from '../utils/HttpParserError';

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class MultipartError extends HttpParserError {
  constructor(message: string) {
    super('MULTIPART_ERROR', message, 400);
    this.name = 'MultipartError';
  }
}

export class ChunkedEncodingError extends HttpParserError {
  constructor(message: string) {
    super('CHUNKED_ENCODING_ERROR', message, 400);
    this.name = 'ChunkedEncodingError';
  }
}

export class BodyLimitExceededError extends HttpParserError {
  readonly limit: number;
  readonly received: number;
  constructor(limit: number, received: number) {
    super(
      'BODY_LIMIT_EXCEEDED',
      `Request body exceeded limit of ${limit} bytes (received ${received}+)`,
      413
    );
    this.name = 'BodyLimitExceededError';
    this.limit = limit;
    this.received = received;
  }
}

export class UrlParseError extends HttpParserError {
  constructor(input: string, reason: string) {
    super('URL_PARSE_ERROR', `Cannot parse URL '${input}': ${reason}`, 400);
    this.name = 'UrlParseError';
  }
}

/* ------------------------------------------------------------------ */
/* Multipart                                                           */
/* ------------------------------------------------------------------ */

/** Lifecycle events the parser emits as it walks a multipart body. */
export interface MultipartPart {
  /** Parsed part headers (normalized: lower-case names). */
  readonly headers: ReadonlyMap<string, string>;
  /** `name` from Content-Disposition, when present. */
  readonly name: string | null;
  /** `filename` from Content-Disposition, when present. */
  readonly filename: string | null;
  /** Content-Type of the part; default text/plain per RFC 7578 §4.4. */
  readonly contentType: string;
}

export interface MultipartCallbacks {
  /** A new part's headers are complete; its body bytes follow. */
  onPart?(part: MultipartPart): void;
  /**
   * Body bytes of the current part (boundary stripped). Arbitrarily
   * chunked — the callback gets whatever segmentation arrives.
   */
  onPartData?(data: Uint8Array): void;
  /** Current part's body ended. */
  onPartEnd?(): void;
  /** Final boundary reached — the whole body is consumed. */
  onComplete?(): void;
}

export interface MultipartOptions {
  /**
   * Boundary string as it appears in Content-Type (without the
   * leading `--` the wire adds).
   */
  readonly boundary: string;
  /**
   * Cap on a single part's bytes. 0 = unlimited. Oversize throws
   * `MultipartError` mid-stream rather than buffering to find out.
   */
  readonly maxPartSize?: number;
  /**
   * Cap on total body bytes processed. 0 = unlimited.
   */
  readonly maxTotalSize?: number;
  /** Cap on part-count. 0 = unlimited. */
  readonly maxParts?: number;
}

/* ------------------------------------------------------------------ */
/* Chunked decoding                                                    */
/* ------------------------------------------------------------------ */

export interface ChunkedCallbacks {
  /** A complete chunk's data bytes (size line + CRLF stripped). */
  onData?(data: Uint8Array): void;
  /**
   * Terminal trailers after the 0-chunk (RFC 9112 §7.1.2).
   * Names are normalized lower-case; values trimmed.
   */
  onTrailers?(trailers: ReadonlyMap<string, string>): void;
  /** Terminal chunk consumed; decoder is done. */
  onComplete?(): void;
}

export interface ChunkedDecoderOptions {
  /** Cap on the chunk-size line (defends against megabyte hex). */
  readonly maxChunkSizeLineBytes?: number;
  /** Cap on total decoded bytes. 0 = unlimited. */
  readonly maxTotalBytes?: number;
  /**
   * Trailers permitted in the trailer section (lower-case). When
   * provided, any other trailer is a protocol error — mirrors
   * server configs that whitelist Trailer headers.
   */
  readonly allowedTrailers?: ReadonlySet<string>;
}

/* ------------------------------------------------------------------ */
/* Header normalization                                                */
/* ------------------------------------------------------------------ */

export interface NormalizedHeader {
  /** Lower-cased field name. */
  readonly name: string;
  /** Unfolded, trimmed value. */
  readonly value: string;
  /** Original casing of the field name as seen on the wire. */
  readonly rawName: string;
}

export interface HeaderNormalizationOptions {
  /**
   * Fields whose multiple occurrences must merge into one
   * comma-joined value (list-valued fields). Always includes the
   * RFC 9110 set: accept, cache-control, etc. Set semantics:
   * entries here ADD to the default set.
   */
  readonly mergeFields?: ReadonlySet<string>;
  /**
   * Fields that must NOT merge — duplicates stay separate
   * (set-cookie is the canonical example: merging breaks expires).
   * Overrides mergeFields.
   */
  readonly noMergeFields?: ReadonlySet<string>;
  /** Trim leading/trailing OWS on values. Default true. */
  readonly trimValues?: boolean;
}

export interface HeaderNormalizationResult {
  /** Normalized headers in first-seen order. */
  readonly headers: NormalizedHeader[];
  /** name → merged value lookup map. */
  readonly byName: ReadonlyMap<string, string>;
  /** Names that appeared more than once. */
  readonly duplicates: ReadonlyMap<string, number>;
  /** Count of obs-fold lines unfolded. */
  readonly foldedLines: number;
}

/* ------------------------------------------------------------------ */
/* URL parsing                                                         */
/* ------------------------------------------------------------------ */

export interface ParsedUrl {
  readonly protocol: string;   // 'http', 'https', '' when absent
  readonly host: string;       // lower-cased, no port
  readonly port: number | null;
  readonly path: string;       // always begins '/' ('/' when absent)
  /** Ordered (key, value) pairs — duplicates preserved. */
  readonly query: ReadonlyArray<readonly [string, string]>;
  /** First value per key (convenience view). */
  readonly queryMap: ReadonlyMap<string, string>;
  readonly fragment: string;
  readonly username: string;
  readonly password: string;
}

export interface UrlParserOptions {
  /** Default port for known schemes (http=80 https=443). */
  readonly inferDefaultPort?: boolean;
  /** Reject URLs longer than this many chars. 0 = unlimited. */
  readonly maxLength?: number;
  /** Decode %XX in path/query/fragment. Default true. */
  readonly decodeComponents?: boolean;
}

/* ------------------------------------------------------------------ */
/* Body size limiting                                                  */
/* ------------------------------------------------------------------ */

export interface BodyLimitOptions {
  /** Hard cap on total bytes fed through. */
  readonly maxBytes: number;
}

export interface BodyLimitResult {
  /** Bytes forwarded (the whole chunk when under limit). */
  readonly accepted: Uint8Array;
  /** Total bytes forwarded so far. */
  readonly totalAccepted: number;
  /** True once the limit has been hit (limiter is spent). */
  readonly exceeded: boolean;
}
