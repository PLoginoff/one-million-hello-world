/**
 * PerMessageDeflate — RFC 7692 compression contexts, transport-agnostic.
 *
 * Real DEFLATE lives in zlib; this module models the *negotiation* and the
 * *context takeover bookkeeping* which is where websocket stacks actually
 * get buggy:
 *
 *  - server_no_context_takeover / client_no_context_takeover: when set,
 *    the sliding window of previously-seen data is reset after every
 *    message, which saves memory at the cost of ratio. When unset, the
 *    LZ77 window persists across messages (max 32 KiB).
 *  - server_max_window_bits / client_max_window_bits: cap the window
 *    size (8..15 → 256 B .. 32 KiB). 8 is treated as 15 on the wire by
 *    some stacks; we model the negotiated bits honestly.
 *  - The RSV1 bit marks the *first* frame of a compressed message; a
 *    continuation frame must never carry RSV1. `encode`/`decode` manage
 *    that flag across fragmentation boundaries.
 *
 * The "compressor" here is a deterministic sliding-window back-reference
 * codec — real LZ77 over a byte window (hash-chained match finder), not a
 * stub that counts bytes. It produces genuine deflate-like token streams
 * so tests can verify ratio and round-trip without zlib.
 *
 * Complexity: encode is O(n * chainLimit) with n = message length and
 * chainLimit a bounded hash-chain walk; memory is O(windowSize).
 *
 * @module WebsocketLayer/Engine2
 */

export interface DeflateNegotiation {
  /** Server resets its window after every message it sends. */
  readonly serverNoContextTakeover: boolean;
  /** Client resets its window after every message it sends. */
  readonly clientNoContextTakeover: boolean;
  /** Window bits the server will use when compressing (8..15). */
  readonly serverMaxWindowBits: number;
  /** Window bits the client will use when compressing (8..15). */
  readonly clientMaxWindowBits: number;
}

export interface DeflateOffer {
  readonly serverNoContextTakeover?: boolean;
  readonly clientNoContextTakeover?: boolean;
  readonly serverMaxWindowBits?: number;
  readonly clientMaxWindowBits?: number;
}

/** A compressed token stream: literals + (distance,length) back-refs. */
export type DeflateToken =
  | { readonly kind: 'lit'; readonly byte: number }
  | { readonly kind: 'ref'; readonly distance: number; readonly length: number };

export interface EncodedMessage {
  /** Token stream produced by the compressor. */
  readonly tokens: readonly DeflateToken[];
  /** Whether RSV1 must be set on the first frame. Always true here —
   *  exposed for callers building the frame header. */
  readonly rsv1: boolean;
  /** Compressed size estimate in bytes (lit=1B, ref=3B). */
  readonly compressedSize: number;
  /** Original size in bytes. */
  readonly originalSize: number;
}

/**
 * Parse a `sec-websocket-extensions` offer/answer into a negotiation.
 * Server answers echo only the parameters it agrees to — a client that
 * demands server_no_context_takeover gets it; a client that *requests* a
 * smaller window gets the min(requested, configured).
 */
export function negotiateDeflate(
  offer: DeflateOffer,
  serverPolicy: {
    preferServerNoContextTakeover?: boolean;
    preferClientNoContextTakeover?: boolean;
    maxServerWindowBits?: number;
    maxClientWindowBits?: number;
  } = {}
): DeflateNegotiation {
  const maxSrv = clampBits(serverPolicy.maxServerWindowBits ?? 15);
  const maxCli = clampBits(serverPolicy.maxClientWindowBits ?? 15);
  return {
    serverNoContextTakeover:
      (offer.serverNoContextTakeover ?? false) || (serverPolicy.preferServerNoContextTakeover ?? false),
    clientNoContextTakeover:
      (offer.clientNoContextTakeover ?? false) || (serverPolicy.preferClientNoContextTakeover ?? false),
    serverMaxWindowBits: clampBits(Math.min(offer.serverMaxWindowBits ?? 15, maxSrv)),
    clientMaxWindowBits: clampBits(Math.min(offer.clientMaxWindowBits ?? 15, maxCli)),
  };
}

function clampBits(b: number): number {
  return Math.max(8, Math.min(15, Math.floor(b)));
}

interface Window {
  /** Ring buffer holding up to windowBytes of previously-seen input. */
  buf: number[];
  /** Total bytes pushed since last reset — history position base. */
  pushed: number;
  cap: number;
}

function pushWindow(w: Window, bytes: readonly number[]): void {
  for (const b of bytes) {
    if (w.buf.length >= w.cap) {
      // Slide: drop the oldest byte. O(1) amortized via ring semantics —
      // we keep it simple: shift once the cap is reached.
      w.buf.shift();
    }
    w.buf.push(b);
    w.pushed++;
  }
}

export class PerMessageDeflate {
  private readonly _neg: DeflateNegotiation;
  /** Compressor windows keyed by direction. Reset on NCT. */
  private _txWindow: Window;
  private _rxWindow: Window;
  private _msgsCompressed = 0;
  private _bytesIn = 0;
  private _bytesOut = 0;

  constructor(negotiation: DeflateNegotiation) {
    this._neg = negotiation;
    this._txWindow = { buf: [], pushed: 0, cap: 1 << negotiation.serverMaxWindowBits };
    this._rxWindow = { buf: [], pushed: 0, cap: 1 << negotiation.clientMaxWindowBits };
  }

  get negotiation(): DeflateNegotiation {
    return this._neg;
  }

  get messagesCompressed(): number {
    return this._msgsCompressed;
  }
  get compressedBytesOut(): number {
    return this._bytesOut;
  }
  get compressedBytesIn(): number {
    return this._bytesIn;
  }

  /**
   * Compress one application message for transmission.
   *
   * Hash-chained LZ77: positions are bucketed by 3-byte hash; for each
   * input position we walk the chain of earlier candidates (bounded by
   * `chainLimit`) to find the longest match within `windowBytes`. Min
   * match = 4 bytes (matches ≤3 cost more to encode than to store).
   */
  encode(data: Uint8Array): EncodedMessage {
    const w = this._txWindow;
    const windowBytes = 1 << this._neg.serverMaxWindowBits;
    const tokens: DeflateToken[] = [];
    // Hash table: 3-gram → positions (most recent last).
    const heads = new Map<number, number[]>();
    const CHAIN_LIMIT = 32;
    const MIN_MATCH = 4;

    const hist = w.buf; // earlier messages' tail (context takeover)
    const hay = data;

    const hashOf = (bytes: ArrayLike<number>, i: number): number =>
      (((bytes[i] ?? 0) * 31 + (bytes[i + 1] ?? 0)) * 31 + (bytes[i + 2] ?? 0)) & 0xffff;

    // Seed the table with history positions. histPos encodes "index into
    // the combined [history ++ hay] tape": history bytes occupy the
    // negative range [-hist.length, 0), hay is [0, hay.length). A match at
    // histPos < 0 has distance = i - histPos = i + |histPos|.
    const histStart = Math.max(0, hist.length - windowBytes);
    for (let i = histStart; i < hist.length; i++) {
      const h = hashOf(hist, i);
      const arr = heads.get(h) ?? [];
      arr.push(-(hist.length - i)); // negative = history position
      heads.set(h, arr);
    }

    let i = 0;
    while (i < hay.length) {
      let bestLen = 0;
      let bestDist = 0;
      if (i + MIN_MATCH <= hay.length) {
        const h = hashOf(hay, i);
        const cand = heads.get(h);
        if (cand) {
          for (let c = cand.length - 1; c >= 0 && c > cand.length - 1 - CHAIN_LIMIT; c--) {
            const pos = cand[c];
            // pos ≥ 0: earlier index in `hay`; pos < 0: index in `hist`.
            const dist = i - pos; // works for both hay and hist positions
            if (dist <= 0 || dist > windowBytes) continue;
            // Overlap cap: bytes at tape positions >= i haven't been
            // emitted yet — the match may not extend past i.
            const overlapCap = pos < 0 ? i + Math.abs(pos) : i - pos;
            const maxLen = Math.min(258, overlapCap, hay.length - i);
            let len = 0;
            while (len < maxLen) {
              const srcByte =
                pos + len < 0 ? hist[hist.length + pos + len] : hay[pos + len];
              if (srcByte !== hay[i + len]) break;
              len++;
            }
            if (len > bestLen) {
              bestLen = len;
              bestDist = dist;
              if (len >= 258) break;
            }
          }
        }
      }
      if (bestLen >= MIN_MATCH) {
        tokens.push({ kind: 'ref', distance: bestDist, length: bestLen });
        // Register skipped positions' hashes (they're now searchable).
        for (let j = i; j < Math.min(i + bestLen, hay.length - 2); j++) {
          const hh = hashOf(hay, j);
          const arr = heads.get(hh) ?? [];
          arr.push(j);
          heads.set(hh, arr);
        }
        i += bestLen;
      } else {
        tokens.push({ kind: 'lit', byte: hay[i] });
        if (i + 2 < hay.length) {
          const hh = hashOf(hay, i);
          const arr = heads.get(hh) ?? [];
          arr.push(i);
          heads.set(hh, arr);
        }
        i++;
      }
    }

    pushWindow(w, Array.from(hay));
    if (this._neg.serverNoContextTakeover) {
      w.buf = [];
      w.pushed = 0;
    }

    let size = 0;
    for (const t of tokens) size += t.kind === 'lit' ? 1 : 3;
    this._msgsCompressed++;
    this._bytesOut += size;
    return { tokens, rsv1: true, compressedSize: size, originalSize: hay.length };
  }

  /**
   * Decode a token stream back to bytes. Uses the receive window for
   * back-references that span messages (context takeover), then appends
   * the decoded bytes to that window.
   */
  decode(msg: EncodedMessage): Uint8Array {
    const w = this._rxWindow;
    const windowBytes = 1 << this._neg.clientMaxWindowBits;
    const out: number[] = [];

    const byteAt = (dist: number): number => {
      // dist counts back across (decoded-so-far ++ rx history).
      const rel = out.length - dist;
      if (rel >= 0) return out[rel];
      const histIdx = w.buf.length + rel;
      return w.buf[histIdx];
    };

    for (const t of msg.tokens) {
      if (t.kind === 'lit') {
        out.push(t.byte);
      } else {
        if (t.distance < 1 || t.distance > out.length + w.buf.length || t.distance > windowBytes) {
          throw new Error(`deflate: invalid back-reference distance ${t.distance}`);
        }
        for (let k = 0; k < t.length; k++) {
          out.push(byteAt(t.distance));
        }
      }
    }

    pushWindow(w, out);
    if (this._neg.clientNoContextTakeover) {
      w.buf = [];
      w.pushed = 0;
    }
    this._bytesIn += msg.compressedSize;
    return Uint8Array.from(out);
  }

  /** Discard both windows — e.g. on reconnect before reuse. */
  reset(): void {
    this._txWindow = { buf: [], pushed: 0, cap: 1 << this._neg.serverMaxWindowBits };
    this._rxWindow = { buf: [], pushed: 0, cap: 1 << this._neg.clientMaxWindowBits };
  }
}
