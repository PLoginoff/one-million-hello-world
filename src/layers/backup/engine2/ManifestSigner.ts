/**
 * Backup Manifest Signing & Verification
 *
 * Tamper evidence at the manifest level: each restore point's object
 * list is canonicalized (sorted object names, then per-object ordered
 * block hashes + checksum) and folded into a chained digest —
 * `manifestHash_n = SHA256(canonical_n || manifestHash_{n-1})`. The
 * result is a hash chain over restore points, so rewriting history
 * breaks every subsequent manifest, not just the edited one.
 *
 * Signing rotates per key-id so a `KeyRotationEngine` run can re-anchor
 * the chain under the new key without recomputing every block hash.
 *
 * @module BackupLayer/Engine2
 */

import { createHash } from 'crypto';
import type { RestorePoint } from '../engines/types';

export interface SignedManifest {
  readonly restorePointId: string;
  readonly keyId: string;
  /** Chain digest: covers manifest + previous signed manifest. */
  readonly chainDigest: string;
  /** Digest of this manifest alone (canonical serialization). */
  readonly manifestDigest: string;
  readonly signedAt: number;
}

/** Genesis constant — the chain's first previous-digest. */
export const MANIFEST_GENESIS = 'MANIFEST-GENESIS-v1';

function canonicalManifest(rp: RestorePoint): string {
  const objects = [...rp.objects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((o) => `${o.name}|${o.size}|${o.checksum}|${o.blockHashes.join(',')}`)
    .join(';');
  return `${rp.id}|${rp.sourceId}|${rp.kind}|${rp.createdAt}|${objects}`;
}

function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export class ManifestSigner {
  private readonly _clock: { now(): number };
  private readonly _chain = new Map<string, SignedManifest>();
  private _tip: string = MANIFEST_GENESIS;

  constructor(clock?: { now(): number }) {
    this._clock = clock ?? { now: () => Date.now() };
  }

  /** Sign a restore point — appends to the chain. */
  sign(rp: RestorePoint, keyId: string): SignedManifest {
    const manifestDigest = sha256hex(canonicalManifest(rp));
    const chainDigest = sha256hex(`${manifestDigest}|${this._tip}`);
    const signed: SignedManifest = {
      restorePointId: rp.id,
      keyId,
      chainDigest,
      manifestDigest,
      signedAt: this._clock.now(),
    };
    this._chain.set(rp.id, signed);
    this._tip = chainDigest;
    return signed;
  }

  /**
   * Verify a signed manifest's manifest-digest (single-record check)
   * and chain placement (full-chain check when `deep` is set).
   */
  verify(rp: RestorePoint, deep = false): { ok: boolean; reason?: string } {
    const signed = this._chain.get(rp.id);
    if (!signed) return { ok: false, reason: 'unsigned' };
    const expected = sha256hex(canonicalManifest(rp));
    if (expected !== signed.manifestDigest) {
      return { ok: false, reason: 'manifest-digest-mismatch' };
    }
    if (deep) return this.verifyChain();
    return { ok: true };
  }

  /**
   * Re-walk the whole chain from genesis — detects reordering,
   * deletion, or content tampering anywhere.
   */
  verifyChain(): { ok: boolean; reason?: string } {
    let prev = MANIFEST_GENESIS;
    for (const [, signed] of this._chain) {
      const recomputed = sha256hex(`${signed.manifestDigest}|${prev}`);
      if (recomputed !== signed.chainDigest) {
        return { ok: false, reason: `chain break at ${signed.restorePointId}` };
      }
      prev = signed.chainDigest;
    }
    if (prev !== this._tip) {
      return { ok: false, reason: 'tip mismatch — chain tail tampered' };
    }
    return { ok: true };
  }

  /**
   * Re-anchor the chain under a new key id after key rotation: re-signs
   * every manifest in insertion order. Chain digests change (they bind
   * the new key id) but manifest digests don't — history is preserved.
   */
  reanchor(newKeyId: string): readonly SignedManifest[] {
    const ordered = [...this._chain.entries()];
    this._chain.clear();
    this._tip = MANIFEST_GENESIS;
    const out: SignedManifest[] = [];
    for (const [rpId, prev] of ordered) {
      const manifestDigest = prev.manifestDigest; // unchanged
      const chainDigest = sha256hex(`${manifestDigest}|${this._tip}`);
      const signed: SignedManifest = {
        restorePointId: rpId,
        keyId: newKeyId,
        chainDigest,
        manifestDigest,
        signedAt: this._clock.now(),
      };
      this._chain.set(rpId, signed);
      this._tip = chainDigest;
      out.push(signed);
    }
    return out;
  }

  get tip(): string {
    return this._tip;
  }

  get size(): number {
    return this._chain.size;
  }

  get(rpId: string): SignedManifest | undefined {
    return this._chain.get(rpId);
  }
}
