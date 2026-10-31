/**
 * StreamCipher — envelope encryption for events at rest.
 *
 * Envelope encryption (the KMS pattern): a long-lived Key Encryption Key
 * (KEK) never touches event data directly. Instead, each stream gets its own
 * Data Encryption Key (DEK) — a random 256-bit AES key — wrapped (encrypted)
 * by the KEK and stored alongside. Encrypting an event:
 *
 *   1. Load (or generate) the stream's DEK; unwrap with KEK if wrapped.
 *   2. Pick a random 96-bit IV (GCM standard nonce size).
 *   3. AES-256-GCM encrypt the serialized payload → ciphertext + auth tag.
 *
 * Why AES-GCM and not CBC/XOR: GCM is AEAD — it authenticates the ciphertext,
 * so a tampered event fails decryption with an integrity error instead of
 * silently producing garbage plaintext. The 12-byte random IV gives ~2^32
 * safe messages per key before nonce-reuse risk — far above stream volumes.
 *
 * Key rotation: `rotateStreamKey` mints DEK v(n+1), re-wraps it, and stamps
 * new envelopes with `keyVersion`. Old envelopes keep decrypting because the
 * wrapped-key ring retains prior versions until `retireKeyVersion`.
 *
 * @module EventLayer/Engine/Security
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { EncryptedEnvelope, EventDecryptionError } from './types';

export interface StreamCipherOptions {
  /**
   * The Key Encryption Key — 32 bytes for AES-256. Generated randomly when
   * omitted (in-memory deployment); production would load from a KMS.
   */
  readonly kek?: Buffer;
  /** RNG for IVs/DEKs — injectable for deterministic tests. */
  readonly randomBytes?: (n: number) => Buffer;
}

interface WrappedDek {
  /** AES-GCM-wrapped DEK (ciphertext). */
  readonly wrapped: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly version: number;
}

interface StreamKeys {
  /** Current active (encrypting) DEK, plaintext — never persisted. */
  active: Buffer;
  activeVersion: number;
  /** All retained versions for decryption of old events. */
  readonly ring: Map<number, { key: Buffer; wrapped: WrappedDek }>;
}

export class StreamCipher {
  private readonly kek: Buffer;
  private readonly random: (n: number) => Buffer;
  private readonly streams = new Map<string, StreamKeys>();

  constructor(options: StreamCipherOptions = {}) {
    this.kek = options.kek ?? randomBytes(32);
    if (this.kek.length !== 32) {
      throw new EventDecryptionError(`KEK must be 32 bytes, got ${this.kek.length}`);
    }
    this.random = options.randomBytes ?? randomBytes;
  }

  /**
   * Encrypts a JSON-serializable payload for `streamId`.
   * Generates and wraps the stream's DEK on first use — "key on demand".
   */
  encrypt(streamId: string, data: unknown): EncryptedEnvelope {
    const keys = this.keysFor(streamId);
    const iv = this.random(12); // 96-bit GCM nonce
    const cipher = createCipheriv('aes-256-gcm', keys.active, iv);
    const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      keyVersion: keys.activeVersion,
    };
  }

  /**
   * Decrypts an envelope. Looks up the DEK by `keyVersion` so old events
   * survive rotation. Throws `EventDecryptionError` on tamper/wrong key —
   * GCM's auth tag catches any bit-flip.
   */
  decrypt<T = unknown>(streamId: string, envelope: EncryptedEnvelope): T {
    const keys = this.streams.get(streamId);
    if (!keys) {
      throw new EventDecryptionError(`No keys for stream "${streamId}"`);
    }
    const entry = keys.ring.get(envelope.keyVersion);
    if (!entry) {
      throw new EventDecryptionError(
        `Stream "${streamId}" retired key version ${envelope.keyVersion}`
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        entry.key,
        Buffer.from(envelope.iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]);
      return JSON.parse(plain.toString('utf8')) as T;
    } catch (e) {
      throw new EventDecryptionError(
        `Decryption failed for stream "${streamId}": ${(e as Error).message}`
      );
    }
  }

  /**
   * Rotates a stream's DEK: mints v(n+1), wraps it under the KEK, keeps the
   * old version on the ring so historical events still decrypt.
   */
  rotateStreamKey(streamId: string): number {
    const keys = this.keysFor(streamId);
    const version = keys.activeVersion + 1;
    const dek = this.random(32);
    keys.ring.set(version, { key: dek, wrapped: this.wrapDek(dek, version) });
    keys.active = dek;
    keys.activeVersion = version;
    return version;
  }

  /**
   * Removes an old DEK version from the ring — events encrypted under it
   * become undecryptable ("crypto-shredding": deleting a key destroys the
   * data effectively, used for GDPR right-to-erasure at scale).
   */
  retireKeyVersion(streamId: string, version: number): boolean {
    const keys = this.streams.get(streamId);
    if (!keys) return false;
    if (version === keys.activeVersion) {
      throw new EventDecryptionError('Cannot retire the active key version');
    }
    return keys.ring.delete(version);
  }

  /** Serializes a stream's wrapped DEKs for persistence alongside the log. */
  exportWrappedKeys(streamId: string): { version: number; wrapped: string; iv: string; tag: string }[] {
    const keys = this.streams.get(streamId);
    if (!keys) return [];
    return [...keys.ring.entries()].map(([version, w]) => ({
      version,
      wrapped: w.wrapped.wrapped.toString('base64'),
      iv: w.wrapped.iv.toString('base64'),
      tag: w.wrapped.tag.toString('base64'),
    }));
  }

  /** Restores a stream's keys from previously exported wrapped DEKs. */
  importWrappedKeys(
    streamId: string,
    wrappedKeys: readonly { version: number; wrapped: string; iv: string; tag: string }[]
  ): void {
    const keys = this.keysFor(streamId);
    for (const w of wrappedKeys) {
      const dek = this.unwrapDek(
        { wrapped: Buffer.from(w.wrapped, 'base64'), iv: Buffer.from(w.iv, 'base64'), tag: Buffer.from(w.tag, 'base64'), version: w.version }
      );
      keys.ring.set(w.version, {
        key: dek,
        wrapped: {
          wrapped: Buffer.from(w.wrapped, 'base64'),
          iv: Buffer.from(w.iv, 'base64'),
          tag: Buffer.from(w.tag, 'base64'),
          version: w.version,
        },
      });
      if (w.version > keys.activeVersion) {
        keys.active = dek;
        keys.activeVersion = w.version;
      }
    }
  }

  /** Crypto-shred: drop every DEK for a stream — its events become unreadable. */
  shredStream(streamId: string): boolean {
    return this.streams.delete(streamId);
  }

  /** Active DEK version for a stream (0 when no keys yet). */
  activeKeyVersion(streamId: string): number {
    return this.streams.get(streamId)?.activeVersion ?? 0;
  }

  // ------------------------------------------------------------------------

  /** Gets or lazily creates a stream's key material (DEK v1 wrapped by KEK). */
  private keysFor(streamId: string): StreamKeys {
    let keys = this.streams.get(streamId);
    if (!keys) {
      const dek = this.random(32);
      const ring = new Map<number, { key: Buffer; wrapped: WrappedDek }>();
      ring.set(1, { key: dek, wrapped: this.wrapDek(dek, 1) });
      keys = { active: dek, activeVersion: 1, ring };
      this.streams.set(streamId, keys);
    }
    return keys;
  }

  /** AES-256-GCM wrap of a DEK under the KEK (deterministic per call via IV). */
  private wrapDek(dek: Buffer, version: number): WrappedDek {
    const iv = this.random(12);
    const cipher = createCipheriv('aes-256-gcm', this.kek, iv);
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    return { wrapped, iv, tag: cipher.getAuthTag(), version };
  }

  private unwrapDek(w: WrappedDek): Buffer {
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.kek, w.iv);
      decipher.setAuthTag(w.tag);
      return Buffer.concat([decipher.update(w.wrapped), decipher.final()]);
    } catch (e) {
      throw new EventDecryptionError(`DEK unwrap failed (v${w.version}): ${(e as Error).message}`);
    }
  }
}
