/**
 * API Key Manager
 *
 * Manages consumer API keys: generation, hashing, verification,
 * rotation and revocation.
 *
 * Key format: `gw_<prefix>.<secret>`
 *  - `<prefix>`  8 url-safe chars identifying the key for lookup
 *  - `<secret>`  43 url-safe chars (256 bits of entropy, base64url)
 *
 * Storage: only SHA-256 hashes of the secret are retained — never the
 * raw key — so a store dump does not leak usable credentials.
 * Verification uses a timing-safe comparison.
 *
 * Rotation: `rotate()` issues a new key and marks the old one with a
 * grace period during which both keys remain valid; after expiry the
 * old key is unusable.
 *
 * @module ApiGatewayLayer/Engine
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { GatewayClock, SystemGatewayClock, GatewayConsumer } from './types';

/** Status of a managed key. */
export type ApiKeyStatus = 'active' | 'rotating' | 'revoked' | 'expired';

/** Stored record for a key (hash only, no secret). */
export interface ApiKeyRecord {
  readonly id: string;
  /** Public prefix, usable for lookup/logging. */
  readonly prefix: string;
  /** SHA-256 hash of the secret portion. */
  readonly secretHash: string;
  readonly consumerId: string;
  status: ApiKeyStatus;
  readonly createdAt: number;
  /** Time after which a rotating key stops being accepted. */
  rotateExpiresAt?: number;
  /** Absolute expiry, if any. */
  expiresAt?: number;
  /** Per-key rate limit override. */
  rateLimitBurst?: number;
  readonly metadata?: Record<string, string>;
}

/** Result of issuing a key. The raw key is returned exactly once. */
export interface IssuedKey {
  /** The full raw key, e.g. `gw_ab12cd34.xxxx...`. Store/transport now. */
  readonly rawKey: string;
  readonly record: ApiKeyRecord;
}

/** Verification outcome. */
export interface VerifyResult {
  readonly ok: boolean;
  readonly key?: ApiKeyRecord;
  readonly reason?: 'malformed' | 'unknown' | 'revoked' | 'expired';
}

const DEFAULT_KEY_TTL_MS = 0; // never
const DEFAULT_ROTATE_GRACE_MS = 24 * 60 * 60 * 1000; // 24h

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64url');
}

/**
 * Constant-time string comparison (length-safe).
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // Compare against itself to keep timing roughly constant.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/**
 * API Key Manager.
 *
 * Lookups are O(1) via prefix index plus O(1) per-consumer sets.
 * The hash of a presented secret is compared only against keys that
 * share the presented prefix, keeping verification cheap.
 */
export class ApiKeyManager {
  private _byPrefix: Map<string, ApiKeyRecord>;
  private _byConsumer: Map<string, Set<string>>;
  private _consumers: Map<string, GatewayConsumer>;
  private _clock: GatewayClock;

  constructor(clock?: GatewayClock) {
    this._byPrefix = new Map();
    this._byConsumer = new Map();
    this._consumers = new Map();
    this._clock = clock ?? new SystemGatewayClock();
  }

  /** Register a consumer that keys may be issued for. */
  registerConsumer(consumer: GatewayConsumer): void {
    this._consumers.set(consumer.id, consumer);
    if (!this._byConsumer.has(consumer.id)) {
      this._byConsumer.set(consumer.id, new Set());
    }
  }

  /** Get consumer by id. */
  getConsumer(consumerId: string): GatewayConsumer | undefined {
    return this._consumers.get(consumerId);
  }

  /**
   * Issue a new API key for a consumer.
   * The raw key is returned once; only its hash is stored.
   */
  issue(options: {
    consumerId: string;
    expiresInMs?: number;
    rateLimitBurst?: number;
    metadata?: Record<string, string>;
  }): IssuedKey {
    const consumer = this._consumers.get(options.consumerId);
    if (!consumer) {
      throw new Error(`Unknown consumer: ${options.consumerId}`);
    }
    const now = this._clock.now();
    const prefix = base64Url(randomBytes(6));
    const secret = base64Url(randomBytes(32));
    const rawKey = `gw_${prefix}.${secret}`;
    const record: ApiKeyRecord = {
      id: `${options.consumerId}:${prefix}`,
      prefix,
      secretHash: sha256Hex(secret),
      consumerId: options.consumerId,
      status: 'active',
      createdAt: now,
      expiresAt:
        options.expiresInMs !== undefined && options.expiresInMs > 0
          ? now + options.expiresInMs
          : DEFAULT_KEY_TTL_MS > 0
            ? now + DEFAULT_KEY_TTL_MS
            : undefined,
      rateLimitBurst: options.rateLimitBurst,
      metadata: options.metadata,
    };
    this._byPrefix.set(prefix, record);
    this._byConsumer.get(options.consumerId)!.add(prefix);
    return { rawKey, record };
  }

  /**
   * Verify a presented raw key.
   *
   * Returns the key record on success. A `rotating` key is still
   * accepted until `rotateExpiresAt` passes.
   */
  verify(rawKey: string): VerifyResult {
    const parsed = this._parse(rawKey);
    if (!parsed) return { ok: false, reason: 'malformed' };
    const record = this._byPrefix.get(parsed.prefix);
    if (!record) return { ok: false, reason: 'unknown' };
    if (record.status === 'revoked') return { ok: false, reason: 'revoked' };

    const now = this._clock.now();
    if (record.expiresAt !== undefined && now > record.expiresAt) {
      record.status = 'expired';
      return { ok: false, reason: 'expired' };
    }
    if (
      record.status === 'rotating' &&
      record.rotateExpiresAt !== undefined &&
      now > record.rotateExpiresAt
    ) {
      record.status = 'expired';
      return { ok: false, reason: 'expired' };
    }

    const candidate = sha256Hex(parsed.secret);
    if (!safeEqual(candidate, record.secretHash)) {
      return { ok: false, reason: 'unknown' };
    }
    return { ok: true, key: record };
  }

  /**
   * Rotate a key: issue a replacement and mark the original with a
   * grace period (default 24h) during which both work.
   *
   * Returns the new issued key. Throws if the old key is unknown.
   */
  rotate(rawKey: string, graceMs: number = DEFAULT_ROTATE_GRACE_MS): IssuedKey {
    const v = this.verify(rawKey);
    if (!v.ok || !v.key) {
      throw new Error(`Cannot rotate key: ${v.reason ?? 'unknown'}`);
    }
    const old = v.key;
    const issued = this.issue({
      consumerId: old.consumerId,
      rateLimitBurst: old.rateLimitBurst,
      metadata: { ...old.metadata, rotatedFrom: old.prefix },
    });
    old.status = 'rotating';
    old.rotateExpiresAt = this._clock.now() + graceMs;
    return issued;
  }

  /** Revoke a key by prefix or full raw key. */
  revoke(rawKeyOrPrefix: string): boolean {
    const prefix = rawKeyOrPrefix.includes('.')
      ? this._parse(rawKeyOrPrefix)?.prefix
      : rawKeyOrPrefix.replace(/^gw_/, '');
    if (!prefix) return false;
    const record = this._byPrefix.get(prefix);
    if (!record) return false;
    record.status = 'revoked';
    return true;
  }

  /** List all key records for a consumer. */
  keysForConsumer(consumerId: string): ApiKeyRecord[] {
    const prefixes = this._byConsumer.get(consumerId);
    if (!prefixes) return [];
    const out: ApiKeyRecord[] = [];
    for (const p of prefixes) {
      const r = this._byPrefix.get(p);
      if (r) out.push(r);
    }
    return out;
  }

  /**
   * Sweep: expire rotating keys past their grace window and remove
   * revoked keys older than `olderThanMs`. Returns count removed.
   */
  sweep(olderThanMs: number = 0): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [prefix, record] of [...this._byPrefix]) {
      if (
        record.status === 'rotating' &&
        record.rotateExpiresAt !== undefined &&
        now > record.rotateExpiresAt
      ) {
        record.status = 'expired';
      }
      if (
        (record.status === 'revoked' || record.status === 'expired') &&
        now - record.createdAt >= olderThanMs
      ) {
        this._byPrefix.delete(prefix);
        this._byConsumer.get(record.consumerId)?.delete(prefix);
        removed++;
      }
    }
    return removed;
  }

  /** Total managed keys. */
  size(): number {
    return this._byPrefix.size;
  }

  private _parse(rawKey: string): { prefix: string; secret: string } | undefined {
    const m = /^gw_([A-Za-z0-9_-]{6,12})\.([A-Za-z0-9_-]{20,})$/.exec(rawKey);
    if (!m) return undefined;
    return { prefix: m[1]!, secret: m[2]! };
  }
}
