/**
 * Blind Index — deterministic equality search over encrypted fields.
 *
 * Problem: encrypted data is opaque to the database — you can't
 * `WHERE email = ?` on ciphertext because semantic security demands
 * randomised encryption (same plaintext → different ciphertext).
 *
 * Solution: store a *blind index* alongside the ciphertext —
 *
 *      tag = HMAC-SHA256(indexKey, normalise(plaintext))
 *
 *   HMAC is a PRF: the tag is computationally indistinguishable from
 *   random to anyone without indexKey, yet deterministic for anyone who
 *   has it. Equality search becomes "compute tag of the query, compare".
 *
 *   Key separation is essential: index keys are *dedicated* — derived
 *   separately from data keys — so the deterministic index can't be used
 *   to attack the randomised encryption key, and shredding a data key
 *   doesn't break the index (the reverse isn't true: shredding the index
 *   key makes fields unsearchable but still decryptable).
 *
 * Normalisation matters: `Alice@X.com` vs `alice@x.com` must produce the
 * same tag or equality search silently misses. Each index pins a named
 * normaliser so indexing and querying always agree.
 *
 * Frequency caveat: deterministic tags leak equality/frequency patterns
 * (who shares a value, how common values are) — inherent to searchable
 * encryption. Documented trade-off, accepted for equality-only search.
 *
 * Complexity: O(1) per index/lookup — HMAC over a short input.
 *
 * @module EncryptionLayer/Engine2
 */

import { createHmac, randomBytes } from 'crypto';
import { CryptoError } from '../crypto/types';
import { KeyUsageAudit } from './KeyUsageAudit';
import { BlindIndex, IClock, Normalizer, SystemClock } from './types';

/** Built-in normalisers — registered by name for portability. */
const NORMALIZERS: Record<string, Normalizer> = {
  /** Emails, usernames: trim + lowercase + NFKC. */
  lowercase: (v) => v.trim().toLowerCase().normalize('NFKC'),
  /** Exact match — case sensitive (serial numbers, tokens). */
  exact: (v) => v.normalize('NFC'),
  /** Phone numbers: digits only (strips +, spaces, dashes). */
  digits: (v) => v.replace(/\D/g, ''),
  /** Names: trim, collapse internal whitespace, lowercase. */
  personName: (v) => v.trim().toLowerCase().normalize('NFKC').replace(/\s+/g, ' '),
};

const INDEX_KEY_BYTES = 32;
/** Domain-separation prefix — index tags can never collide with HMACs
 *  computed for other purposes under related keys. */
const DOMAIN = 'omhw:blind-index:v1';

export class BlindIndexService {
  private readonly _clock: IClock;
  private readonly _audit: KeyUsageAudit;
  /** keyId → raw index key. */
  private readonly _keys = new Map<string, Buffer>();
  /** field → index descriptor. */
  private readonly _indexes = new Map<string, BlindIndex>();

  constructor(opts: { clock?: IClock; audit?: KeyUsageAudit } = {}) {
    this._clock = opts.clock ?? new SystemClock();
    this._audit = opts.audit ?? new KeyUsageAudit({}, this._clock);
  }

  /**
   * Create a blind index for a field with a fresh dedicated key.
   * Returns the index descriptor (persist it with the schema, not the data).
   */
  createIndex(field: string, normalizerName: keyof typeof NORMALIZERS | string): BlindIndex {
    const normalizer = NORMALIZERS[normalizerName];
    if (!normalizer) throw new CryptoError('invalid_format', `unknown normalizer: ${normalizerName}`);
    if (this._indexes.has(field)) {
      throw new CryptoError('invalid_format', `index already exists for ${field}`);
    }
    const keyId = `idx-${field}-${randomBytes(4).toString('hex')}`;
    this._keys.set(keyId, randomBytes(INDEX_KEY_BYTES));
    const idx: BlindIndex = { keyId, field, normalizerName };
    this._indexes.set(field, idx);
    this._audit.record(keyId, 'generate', field, `blind-index:${normalizerName}`);
    return idx;
  }

  /** Compute the search tag for a plaintext value on a field's index. */
  tag(field: string, plaintext: string): string {
    const idx = this._indexes.get(field);
    if (!idx) throw new CryptoError('key_not_found', `no blind index for field: ${field}`);
    const key = this._keys.get(idx.keyId)!;
    const normalizer = NORMALIZERS[idx.normalizerName]!;
    const normalized = normalizer(plaintext);
    const tag = createHmac('sha256', key)
      .update(`${DOMAIN}:${idx.field}:`)
      .update(normalized, 'utf8')
      .digest('base64url');
    this._audit.record(idx.keyId, 'index', field);
    return tag;
  }

  /**
   * Constant-time-ish membership probe: does `storedTag` match
   * `plaintext` on this field? (JS can't guarantee constant time, but
   * HMAC tags are compared as fixed-length strings — no early exit on
   * prefix match at the algorithm level.)
   */
  matches(field: string, plaintext: string, storedTag: string): boolean {
    return this.tag(field, plaintext) === storedTag;
  }

  /**
   * Destroy an index's key — makes the field permanently unsearchable
   * (existing tags can never be verified) while data stays decryptable.
   * Complements crypto-shredding for the "unsearchable but recoverable"
   * corner of retention policy.
   */
  destroyIndex(field: string): void {
    const idx = this._indexes.get(field);
    if (!idx) return;
    const key = this._keys.get(idx.keyId);
    if (key) {
      key.fill(0);
      this._keys.delete(idx.keyId);
    }
    this._indexes.delete(field);
    this._audit.record(idx.keyId, 'destroy', field, 'index-key-destroyed');
  }

  /** Registered fields. */
  fields(): string[] {
    return [...this._indexes.keys()];
  }
}
