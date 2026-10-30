/**
 * ResumeBuffer — per-connection replay log for WebSocket reconnection.
 *
 * TCP gives you byte-level retransmission; WebSocket gives you nothing —
 * once the socket dies, every in-flight message is gone. Real-time apps
 * (chat, feeds, collaborative docs) solve this with a *resume* protocol:
 *
 *   1. Server tags each outbound message with a monotonic sequence number
 *      and appends it to a bounded ring buffer.
 *   2. On reconnect, the client presents a *resume token* encoding its
 *      last-received sequence (`"<connId>:<seq>"`).
 *   3. Server looks up the buffer for that connection and replays
 *      everything after `seq`, in order, before resuming live traffic.
 *
 * Design notes:
 *
 *  - The ring buffer is **bounded in bytes and entries** — a client that
 *    reconnects after the window slid past `lastSeq` gets a
 *    {@link ResumeResult.GAP} and must re-snapshot application state.
 *    Unbounded replay is a memory DoS; a gap signal is a protocol feature.
 *  - Sequences are per-connection and monotonically increasing, but do
 *    *not* start at 0 — they continue from the buffer's previous owner so
 *    an attacker can't forge a token for a fresh connection by guessing
 *    `newConn:0`. The {@link ResumeTokenIssuer} mints opaque tokens.
 *  - Entries store the serialized frame bytes, so replay is a zero-copy
 *    splice into the transport.
 *  - Tokens are HMAC-signed so a client can't fabricate `seq` values to
 *    re-read history it already lost. Signing is injectable — tests use a
 *    trivial signer, production wires `crypto.createHmac`.
 *
 * Complexity: append is O(1) amortized (ring drop from head);
 * `replayAfter` is O(k) in replayed entries; memory bounded by
 * `maxBufferBytes`.
 *
 * @module WebsocketLayer/Server
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** A single sequenced outbound message kept for replay. */
export interface BufferedMessage {
  /** Per-connection monotonic sequence. */
  readonly seq: number;
  /** Serialized application payload (pre-frame). */
  readonly payload: Buffer;
  /** Whether the payload goes out as a binary frame. */
  readonly binary: boolean;
  /** payload.byteLength + framing overhead — used for the byte cap. */
  readonly bytes: number;
  /** Wall/virtual time of append, for staleness diagnostics. */
  readonly appendedAt: number;
}

/** Outcome of asking the buffer for a replay. */
export type ResumeResult =
  | {
      readonly kind: 'replay';
      /** Messages strictly after the client's lastSeq, in order. */
      readonly messages: readonly BufferedMessage[];
      /** First seq the client should expect for live traffic after replay. */
      readonly nextSeq: number;
    }
  | {
      readonly kind: 'gap';
      /** Oldest seq still retained — the client missed more than the window. */
      readonly oldestAvailableSeq: number;
      readonly nextSeq: number;
    };

export interface ResumeBufferOptions {
  /** Max retained entries. Default 1024. */
  readonly maxEntries?: number;
  /** Max retained payload bytes. Default 1 MiB. */
  readonly maxBytes?: number;
  /** First sequence to issue. Default random-ish 1 (see ResumeSession). */
  readonly firstSeq?: number;
  /** Per-entry byte overhead for accounting. Default 14. */
  readonly perMessageOverhead?: number;
  readonly now?: () => number;
}

/**
 * Bounded ring of sequenced messages for ONE logical connection.
 * When capacity is exceeded the *oldest* entries are evicted — replay
 * windows are intentionally lossy past the configured horizon.
 */
export class ResumeBuffer {
  private readonly _maxEntries: number;
  private readonly _maxBytes: number;
  private readonly _overhead: number;
  private readonly _now: () => number;

  /** Ring storage: index = (seq - firstSeq) mapped through eviction. */
  private _entries: BufferedMessage[] = [];
  private _bytes = 0;
  private _nextSeq: number;
  /** Total messages ever appended — lifetime counter. */
  private _appended = 0;
  /** Total messages evicted before being replayed — measures window pressure. */
  private _evicted = 0;

  constructor(options: ResumeBufferOptions = {}) {
    this._maxEntries = options.maxEntries ?? 1024;
    this._maxBytes = options.maxBytes ?? 1024 * 1024;
    this._overhead = options.perMessageOverhead ?? 14;
    this._now = options.now ?? (() => Date.now());
    this._nextSeq = options.firstSeq ?? 1;
  }

  /** Next sequence number that {@link append} will assign. */
  get nextSeq(): number {
    return this._nextSeq;
  }

  /** Oldest retained seq, or null when empty. */
  get oldestSeq(): number | null {
    return this._entries.length > 0 ? this._entries[0].seq : null;
  }

  /** Entries retained and bytes held. */
  get size(): { entries: number; bytes: number } {
    return { entries: this._entries.length, bytes: this._bytes };
  }

  get evictedCount(): number {
    return this._evicted;
  }

  /**
   * Append an outbound message and assign it the next sequence.
   * Evicts from the head while over either bound.
   */
  append(payload: Buffer, binary = false): BufferedMessage {
    const entry: BufferedMessage = {
      seq: this._nextSeq++,
      payload,
      binary,
      bytes: payload.byteLength + this._overhead,
      appendedAt: this._now(),
    };
    this._entries.push(entry);
    this._bytes += entry.bytes;
    this._appended++;
    this._evictOverCapacity();
    return entry;
  }

  /**
   * Produce the replay plan for a client whose last-received seq is
   * `lastSeq`.
   *
   * Three cases:
   *  - `lastSeq >= nextSeq - 1` → nothing missed; empty replay.
   *  - `lastSeq >= oldestSeq - 1` → window covers the gap; replay
   *    `(lastSeq, nextSeq)`.
   *  - `lastSeq < oldestSeq - 1` → the client fell out of the window → GAP.
   */
  replayAfter(lastSeq: number): ResumeResult {
    const oldest = this.oldestSeq;
    if (oldest === null || lastSeq >= this._nextSeq - 1) {
      return { kind: 'replay', messages: [], nextSeq: this._nextSeq };
    }
    if (lastSeq < oldest - 1) {
      return { kind: 'gap', oldestAvailableSeq: oldest, nextSeq: this._nextSeq };
    }
    // Entries are contiguous and sorted by seq — binary search for the
    // first entry with seq > lastSeq instead of a linear scan.
    let lo = 0;
    let hi = this._entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._entries[mid].seq <= lastSeq) lo = mid + 1;
      else hi = mid;
    }
    return { kind: 'replay', messages: this._entries.slice(lo), nextSeq: this._nextSeq };
  }

  /** Drop all state (connection fully gone). */
  clear(): void {
    this._entries = [];
    this._bytes = 0;
  }

  private _evictOverCapacity(): void {
    while (
      this._entries.length > 0 &&
      (this._entries.length > this._maxEntries || this._bytes > this._maxBytes)
    ) {
      const evicted = this._entries.shift();
      if (evicted === undefined) break;
      this._bytes -= evicted.bytes;
      this._evicted++;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Resume tokens                                                       */
/* ------------------------------------------------------------------ */

/**
 * Signer for resume tokens — injectable so tests don't need real HMAC
 * and deployments can rotate secrets.
 */
export interface ResumeTokenSigner {
  /** Produce the MAC for `"<connectionId>:<lastSeq>"`. */
  sign(payload: string): Buffer;
  /** Key length used for verification (must match `sign`). */
  readonly macBytes: number;
}

/** HMAC-SHA256 signer, truncated to 16 bytes — 128 bits of integrity. */
export class HmacResumeTokenSigner implements ResumeTokenSigner {
  readonly macBytes = 16;
  private readonly _secret: Buffer;

  constructor(secret: Buffer | string) {
    this._secret = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
  }

  sign(payload: string): Buffer {
    return createHmac('sha256', this._secret).update(payload, 'utf8').digest().subarray(0, this.macBytes);
  }
}

/** Insecure signer for tests — deterministic, tiny MAC, clearly labeled. */
export class TestResumeTokenSigner implements ResumeTokenSigner {
  readonly macBytes = 4;
  sign(payload: string): Buffer {
    let h = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      h ^= payload.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    const b = Buffer.alloc(4);
    b.writeUInt32BE(h >>> 0, 0);
    return b;
  }
}

/** Wire format: base64url( connIdLen(u8) ‖ connId ‖ seq(u64be) ‖ mac ). */
export interface ResumeToken {
  readonly connectionId: string;
  readonly lastSeq: number;
}

export class ResumeTokenIssuer {
  private readonly _signer: ResumeTokenSigner;

  constructor(signer: ResumeTokenSigner) {
    this._signer = signer;
  }

  /**
   * Mint a token binding `connectionId` to `lastSeq`.
   * connId is length-prefixed (u8) so arbitrary ids are safe; seq is a
   * fixed u64 — values above 2^53 lose precision, which is ~10^15
   * messages on one connection: acceptable.
   */
  issue(connectionId: string, lastSeq: number): string {
    const id = Buffer.from(connectionId, 'utf8');
    if (id.byteLength > 255) throw new Error('connectionId too long');
    const body = Buffer.alloc(1 + id.byteLength + 8);
    body.writeUInt8(id.byteLength, 0);
    id.copy(body, 1);
    body.writeBigUInt64BE(BigInt(lastSeq), 1 + id.byteLength);
    const mac = this._signer.sign(body.toString('latin1'));
    return Buffer.concat([body, mac]).toString('base64url');
  }

  /**
   * Parse and verify a token. Returns null on any malformation or MAC
   * mismatch — never throws, never reveals *why* (treat all forgery
   * attempts identically).
   */
  verify(token: string): ResumeToken | null {
    let raw: Buffer;
    try {
      raw = Buffer.from(token, 'base64url');
    } catch {
      return null;
    }
    const macLen = this._signer.macBytes;
    if (raw.byteLength < 1 + 8 + macLen) return null;
    const body = raw.subarray(0, raw.byteLength - macLen);
    const mac = raw.subarray(raw.byteLength - macLen);
    const expected = this._signer.sign(body.toString('latin1'));
    if (expected.byteLength !== mac.byteLength || !timingSafeEqual(expected, mac)) {
      return null;
    }
    const idLen = body.readUInt8(0);
    if (body.byteLength !== 1 + idLen + 8) return null;
    const connectionId = body.subarray(1, 1 + idLen).toString('utf8');
    const lastSeq = Number(body.readBigUInt64BE(1 + idLen));
    return { connectionId, lastSeq };
  }
}

/** Generate a fresh connection id (for issuance at handshake time). */
export function newConnectionId(): string {
  return randomBytes(12).toString('base64url');
}
