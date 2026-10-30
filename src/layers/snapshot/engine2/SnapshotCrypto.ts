/**
 * SnapshotCrypto — AES-256-GCM authenticated encryption for snapshots at rest.
 *
 * Wraps a `SnapshotManager` so stored snapshots can be sealed into
 * self-contained encrypted envelopes and later unsealed + verified.
 *
 * Wire format (all binary, base64url in the JSON envelope):
 *
 *   envelope = {
 *     v: 1,
 *     alg: 'AES-256-GCM',
 *     kid: key-id,                      // for key rotation
 *     iv: 12-byte nonce,                // random per seal — NEVER reuse
 *     ct: ciphertext || 16-byte GCM tag
 *   }
 *
 *   plaintext  = canonical JSON of the snapshot payload
 *   aad        = `snapshot:<id>:v<version>` — binds the ciphertext to
 *                the snapshot identity, so an envelope cannot be
 *                replayed under a different snapshot id.
 *
 * Key management: a `KeyProvider` resolves kid → raw 32-byte key so
 * envelopes written under an old key remain readable after rotation.
 * `StaticKeyProvider` is the in-memory default.
 *
 * Threat model: confidentiality + integrity of the snapshot payload at
 * rest. The manager's in-memory structures are NOT encrypted — this is
 * a boundary for export/backup-at-rest, not for live memory.
 *
 * @module SnapshotLayer/Engine2
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'crypto';
import { SnapshotManager } from '../implementations/SnapshotManager';
import type { StoredSnapshot, SnapshotBlock } from '../implementations/SnapshotManager';

// ------------------------------------------------------------------ keys

/** Resolves a key id to raw key bytes (32 bytes for AES-256). */
export interface KeyProvider {
  /** Raw key bytes for `kid`, or undefined if unknown/retired. */
  keyFor(kid: string): Buffer | undefined;
  /** Currently active key id used for new seals. */
  activeKid(): string;
}

/** Simple in-memory provider — suitable for tests and single-process use. */
export class StaticKeyProvider implements KeyProvider {
  private readonly _keys = new Map<string, Buffer>();
  private _active: string;

  constructor(keys: Record<string, Buffer> | string, active?: string) {
    if (typeof keys === 'string') {
      // Derive a 32-byte key from a passphrase — NOT a KDF substitute in
      // production, but deterministic and dependency-free here.
      const kid = 'k0';
      this._keys.set(kid, createHash('sha256').update(keys).digest());
      this._active = kid;
    } else {
      for (const [kid, k] of Object.entries(keys)) {
        if (k.length !== 32) throw new Error(`Key '${kid}' must be 32 bytes, got ${k.length}`);
        this._keys.set(kid, k);
      }
      const first = Object.keys(keys)[0];
      this._active = active ?? first ?? '';
    }
    if (this._active === '' || !this._keys.has(this._active)) {
      throw new Error('No active encryption key configured');
    }
  }

  /** Register an additional key and optionally make it active. */
  addKey(kid: string, key: Buffer, makeActive = false): void {
    if (key.length !== 32) throw new Error(`Key '${kid}' must be 32 bytes`);
    this._keys.set(kid, key);
    if (makeActive) this._active = kid;
  }

  keyFor(kid: string): Buffer | undefined {
    return this._keys.get(kid);
  }

  activeKid(): string {
    return this._active;
  }
}

// ------------------------------------------------------------------ envelope

/** Serializable encrypted snapshot envelope. */
export interface SnapshotEnvelope {
  readonly v: 1;
  readonly alg: 'AES-256-GCM';
  readonly kid: string;
  /** base64url 12-byte nonce. */
  readonly iv: string;
  /** base64url ciphertext + 16-byte auth tag. */
  readonly ct: string;
  /** AAD binding string — verified on open. */
  readonly aad: string;
}

/** Plaintext payload inside the envelope. */
export interface SealedPayload {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly takenAt: number;
  readonly bucketCount: number;
  readonly parentId?: string;
  readonly labels: string[];
  readonly blocks: SnapshotBlock[];
  readonly rootHash: string;
}

// ------------------------------------------------------------------ crypto

const IV_LEN = 12;
const TAG_LEN = 16;

export class SnapshotCrypto {
  private readonly _keys: KeyProvider;
  private readonly _rng: (n: number) => Buffer;

  constructor(keys: KeyProvider, rng: (n: number) => Buffer = (n) => randomBytes(n)) {
    this._keys = keys;
    this._rng = rng;
  }

  private static _aadFor(id: string, version: number): string {
    return `snapshot:${id}:v${version}`;
  }

  /**
   * Serialize + encrypt a stored snapshot into a portable envelope.
   * Fresh random IV per call — GCM nonce-reuse is catastrophic, so the
   * RNG is injectable ONLY for deterministic tests, never for reuse.
   */
  seal(snap: StoredSnapshot): SnapshotEnvelope {
    const kid = this._keys.activeKid();
    const key = this._keys.keyFor(kid);
    if (!key) throw new Error(`Active key '${kid}' not resolvable`);

    const payload: SealedPayload = {
      id: snap.id,
      kind: snap.kind,
      version: snap.version,
      takenAt: snap.takenAt,
      bucketCount: snap.bucketCount,
      parentId: snap.parentId,
      labels: [...snap.labels],
      blocks: snap.blocks,
      rootHash: snap.rootHash,
    };
    const aad = SnapshotCrypto._aadFor(snap.id, snap.version);
    const iv = this._rng(IV_LEN);
    if (iv.length !== IV_LEN) throw new Error('IV must be 12 bytes');

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      v: 1,
      alg: 'AES-256-GCM',
      kid,
      iv: iv.toString('base64url'),
      ct: Buffer.concat([ct, tag]).toString('base64url'),
      aad,
    };
  }

  /**
   * Decrypt + authenticate an envelope. Throws on tampering — GCM's
   * auth tag failure is the integrity check; we additionally verify
   * the AAD matches the claimed snapshot id.
   */
  unseal(env: SnapshotEnvelope): SealedPayload {
    if (env.v !== 1 || env.alg !== 'AES-256-GCM') {
      throw new Error(`Unsupported envelope (v=${env.v}, alg=${env.alg})`);
    }
    const key = this._keys.keyFor(env.kid);
    if (!key) throw new Error(`Unknown key id '${env.kid}'`);

    const iv = Buffer.from(env.iv, 'base64url');
    const raw = Buffer.from(env.ct, 'base64url');
    if (raw.length < TAG_LEN + 1) throw new Error('Envelope ciphertext too short');
    const ct = raw.subarray(0, raw.length - TAG_LEN);
    const tag = raw.subarray(raw.length - TAG_LEN);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(env.aad, 'utf8'));
    decipher.setAuthTag(tag);
    let pt: Buffer;
    try {
      pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch {
      throw new Error('Snapshot envelope failed authentication (tampered or wrong key)');
    }
    const payload = JSON.parse(pt.toString('utf8')) as SealedPayload;

    // AAD-vs-payload binding check — belt and suspenders on top of GCM.
    const expectedAad = SnapshotCrypto._aadFor(payload.id, payload.version);
    const a = Buffer.from(expectedAad);
    const b = Buffer.from(env.aad);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Envelope AAD does not match payload identity');
    }
    return payload;
  }

  /**
   * Round-trip check: seal then unseal must yield the identical
   * serialized payload. Used by self-tests and key-rotation validation.
   */
  roundTrip(snap: StoredSnapshot): boolean {
    const env = this.seal(snap);
    const back = this.unseal(env);
    return JSON.stringify(back.blocks) === JSON.stringify(snap.blocks) && back.rootHash === snap.rootHash;
  }
}

/**
 * Encrypted wrapper around a `SnapshotManager`: every `take` is
 * additionally sealed into an envelope kept in a side store, so the
 * encrypted backups can be shipped off-box without the plaintext map.
 */
export class EncryptedSnapshotStore {
  private readonly _manager: SnapshotManager;
  private readonly _crypto: SnapshotCrypto;
  private readonly _envelopes = new Map<string, SnapshotEnvelope>();

  constructor(manager: SnapshotManager, crypto: SnapshotCrypto) {
    this._manager = manager;
    this._crypto = crypto;
  }

  /** Take a snapshot and seal it — returns both records. */
  takeAndSeal(options: Parameters<SnapshotManager['take']>[0] = {}): { snap: StoredSnapshot; envelope: SnapshotEnvelope } {
    const snap = this._manager.take(options);
    const envelope = this._crypto.seal(snap);
    this._envelopes.set(snap.id, envelope);
    return { snap, envelope };
  }

  /** Fetch the sealed envelope for a snapshot. */
  envelope(id: string): SnapshotEnvelope | undefined {
    return this._envelopes.get(id);
  }

  /** All envelopes (for shipping to off-site storage). */
  envelopes(): SnapshotEnvelope[] {
    return [...this._envelopes.values()];
  }

  /**
   * Verify an envelope decrypts and its payload matches the live
   * manager's stored snapshot — detects drift between plaintext and
   * sealed copies.
   */
  verifyEnvelope(id: string): boolean {
    const env = this._envelopes.get(id);
    if (!env) return false;
    const payload = this._crypto.unseal(env);
    const snap = this._manager.get(id);
    return payload.rootHash === snap.rootHash;
  }
}
