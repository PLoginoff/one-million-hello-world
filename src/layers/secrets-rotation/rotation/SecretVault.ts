/**
 * Secrets Rotation — Envelope-Encryption Secret Vault
 *
 * Simulated envelope encryption: each secret value is wrapped by a random
 * data-encryption key (DEK), and the DEK is itself encrypted under the
 * currently-ACTIVE master key from the {@link RotationEngine}. Rotating the
 * master key therefore doesn't re-encrypt every payload — only the small
 * DEKs get re-wrapped, which is exactly why envelope encryption exists.
 *
 * The cipher is a simulation-grade stream: SHA-256-sim-style counter-mode
 * keystream (keystream = K(key, nonce‖counter) blocks XORed with plaintext)
 * plus an FNV integrity tag. Not a real AEAD — deterministic, dependency-free
 * and sufficient to model rewrap/rotate/decrypt semantics.
 *
 * @module SecretsRotation/Rotation
 */

import { RotationEngine } from './RotationEngine';
import { RotationClock } from './RotationTypes';

const MASK64 = 0xffffffffffffffffn;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function mix64(x: bigint): bigint {
  x ^= x >> 33n;
  x = (x * 0xff51afd7ed558ccdn) & MASK64;
  x ^= x >> 33n;
  x = (x * 0xc4ceb9fe1a85ec53n) & MASK64;
  x ^= x >> 33n;
  return x;
}

function seedFrom(bytes: Uint8Array): bigint {
  let s = 0x9e3779b97f4a7c15n;
  for (let i = 0; i < bytes.length; i++) {
    s = mix64(s ^ BigInt(bytes[i]) ^ BigInt(i));
  }
  return s;
}

/** Counter-mode keystream XOR — symmetric (encrypt === decrypt). */
function xorStream(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  const seed = seedFrom(key) ^ seedFrom(nonce);
  const out = new Uint8Array(data.length);
  let counter = 0n;
  for (let off = 0; off < data.length; off += 8) {
    let ks = mix64(seed ^ counter);
    for (let i = 0; i < 8 && off + i < data.length; i++) {
      out[off + i] = data[off + i] ^ Number((ks >> BigInt(8 * i)) & 0xffn);
    }
    counter++;
  }
  return out;
}

function fnv(data: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < data.length; i++) {
    h ^= BigInt(data[i]);
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h.toString(16).padStart(16, '0');
}

export interface WrappedSecret {
  readonly secretId: string;
  /** Ciphertext of the value under the DEK. */
  readonly ciphertext: Uint8Array;
  /** DEK ciphertext under the master key id recorded below. */
  readonly wrappedDek: Uint8Array;
  /** Master key id the DEK is wrapped with — drives rewrap on rotation. */
  readonly masterKeyId: string;
  readonly nonce: Uint8Array;
  /** Integrity tag over ciphertext‖wrappedDek‖nonce. */
  readonly tag: string;
  readonly createdAt: number;
}

export class SecretVault {
  private readonly _engine: RotationEngine;
  private readonly _clock: RotationClock;
  private readonly _random: () => number;
  private readonly _store = new Map<string, WrappedSecret>();
  /** Master keyId → material for DEK unwrap (kept so retired-but-in-grace keys still decrypt). */
  private readonly _masterMaterial = new Map<string, Uint8Array>();

  constructor(engine: RotationEngine, clock: RotationClock = Date.now, random: () => number = Math.random) {
    this._engine = engine;
    this._clock = clock;
    this._random = random;
  }

  /** Register master key material for wrap/unwrap (call after each rotation). */
  registerMasterKey(keyId: string, material: Uint8Array): void {
    this._masterMaterial.set(keyId, Uint8Array.from(material));
  }

  private _randBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.floor(this._random() * 256);
    return out;
  }

  /**
   * Store a value: fresh DEK encrypts the payload; the DEK is wrapped under
   * the secret's CURRENT ACTIVE master key from the rotation engine.
   */
  put(secretId: string, plaintext: string): WrappedSecret {
    const active = this._engine.activeKey(secretId);
    if (!active) throw new Error(`no active master key for '${secretId}'`);
    const master = this._masterMaterial.get(active.material.keyId) ?? active.material.material;

    const dek = this._randBytes(32);
    const nonce = this._randBytes(16);
    const ciphertext = xorStream(dek, nonce, encoder.encode(plaintext));
    const wrappedDek = xorStream(master, nonce, dek);
    const tag = fnv(concat(ciphertext, wrappedDek, nonce));

    const rec: WrappedSecret = {
      secretId,
      ciphertext,
      wrappedDek,
      masterKeyId: active.material.keyId,
      nonce,
      tag,
      createdAt: this._clock(),
    };
    this._store.set(secretId, rec);
    return rec;
  }

  /**
   * Read a value. The stored masterKeyId selects the unwrapping key — a key
   * inside its dual-key grace window still unwraps (this is what the window
   * is FOR); a revoked/expired key fails closed.
   */
  get(secretId: string): string | null {
    const rec = this._store.get(secretId);
    if (!rec) return null;
    const validation = this._engine.validate(secretId, rec.masterKeyId);
    if (!validation.valid) return null;
    const master = this._masterMaterial.get(rec.masterKeyId);
    if (!master) return null;
    const dek = xorStream(master, rec.nonce, rec.wrappedDek);
    const plaintext = xorStream(dek, rec.nonce, rec.ciphertext);
    return decoder.decode(plaintext);
  }

  /**
   * Re-wrap every stored DEK under the current ACTIVE master key. Called
   * after a rotation — O(secrets) not O(payload bytes), the entire point of
   * envelope encryption.
   */
  rewrapAll(): { rewrapped: number; failed: string[] } {
    let rewrapped = 0;
    const failed: string[] = [];
    for (const [secretId, rec] of this._store) {
      const active = this._engine.activeKey(secretId);
      if (!active) {
        failed.push(secretId);
        continue;
      }
      if (rec.masterKeyId === active.material.keyId) continue; // already current
      const oldMaster = this._masterMaterial.get(rec.masterKeyId);
      if (!oldMaster) {
        failed.push(secretId);
        continue;
      }
      const dek = xorStream(oldMaster, rec.nonce, rec.wrappedDek);
      const newMaster = this._masterMaterial.get(active.material.keyId) ?? active.material.material;
      const wrappedDek = xorStream(newMaster, rec.nonce, dek);
      const tag = fnv(concat(rec.ciphertext, wrappedDek, rec.nonce));
      this._store.set(secretId, { ...rec, wrappedDek, masterKeyId: active.material.keyId, tag });
      rewrapped++;
    }
    return { rewrapped, failed };
  }

  /** Stored record for a secret (for audit/inspection). */
  record(secretId: string): WrappedSecret | undefined {
    return this._store.get(secretId);
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
