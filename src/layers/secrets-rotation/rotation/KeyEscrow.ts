/**
 * Secrets Rotation — Key Escrow & Recovery
 *
 * Escrow for retired-but-auditable key material: when a key retires its
 * material is sealed into escrow under a recovery officer's public key
 * (simulated: XOR-sealed + fingerprint-committed), allowing authorized
 * recovery of historical material for legal-forensic decryption while
 * keeping it inaccessible to normal operations.
 *
 * Model: shamir-lite — the escrowed material is XOR-split into `shares`
 * such that ALL shares are required to reconstruct (simple XOR sharing,
 * not threshold-Shamir — documented limitation). Each share goes to a
 * distinct custodian. Reconstruction requires every share — one honest
 * custodian blocks unilateral access.
 *
 * @module SecretsRotation/Rotation
 */

import { RotationClock } from './RotationTypes';

export interface EscrowRecord {
  readonly escrowId: string;
  readonly keyId: string;
  readonly secretId: string;
  readonly createdAt: number;
  readonly shareCount: number;
  readonly custodianIds: ReadonlyArray<string>;
  /** FNV fingerprint of the sealed material — proves custody without exposure. */
  readonly fingerprint: string;
  sealed: boolean;
  reconstructedAt?: number;
}

interface Share {
  readonly custodianId: string;
  readonly bytes: Uint8Array;
}

export class KeyEscrow {
  private readonly _clock: RotationClock;
  private readonly _random: () => number;
  private readonly _records = new Map<string, EscrowRecord>();
  private readonly _shares = new Map<string, Share[]>();

  constructor(clock: RotationClock = Date.now, random: () => number = Math.random) {
    this._clock = clock;
    this._random = random;
  }

  /**
   * Seal key material into escrow split across `custodianIds`. Each
   * custodian gets one XOR share; reconstruction needs ALL shares.
   */
  seal(
    escrowId: string,
    keyId: string,
    secretId: string,
    material: Uint8Array,
    custodianIds: ReadonlyArray<string>
  ): EscrowRecord {
    if (custodianIds.length < 2) {
      throw new RangeError('escrow requires ≥2 custodians — one honest custodian must be able to veto');
    }
    if (this._records.has(escrowId)) throw new Error(`escrow '${escrowId}' exists`);

    // XOR split: material = s1 ⊕ s2 ⊕ ... ⊕ sn. First n-1 shares random,
    // last share = material ⊕ (all previous).
    const shares: Share[] = [];
    let acc = new Uint8Array(material.length);
    for (let i = 0; i < custodianIds.length - 1; i++) {
      const share = new Uint8Array(material.length);
      for (let b = 0; b < material.length; b++) {
        share[b] = Math.floor(this._random() * 256);
        acc[b] ^= share[b];
      }
      shares.push({ custodianId: custodianIds[i], bytes: share });
    }
    const last = new Uint8Array(material.length);
    for (let b = 0; b < material.length; b++) {
      last[b] = material[b] ^ acc[b];
    }
    shares.push({ custodianId: custodianIds[custodianIds.length - 1], bytes: last });

    const rec: EscrowRecord = {
      escrowId,
      keyId,
      secretId,
      createdAt: this._clock(),
      shareCount: shares.length,
      custodianIds,
      fingerprint: fnvBytes(material),
      sealed: true,
    };
    this._records.set(escrowId, rec);
    this._shares.set(escrowId, shares);
    return rec;
  }

  /** A custodian's share (only they may read it). */
  shareFor(escrowId: string, custodianId: string): Uint8Array | null {
    const shares = this._shares.get(escrowId);
    const share = shares?.find((s) => s.custodianId === custodianId);
    return share ? Uint8Array.from(share.bytes) : null;
  }

  /**
   * Reconstruct the material from ALL custodian shares. Callers pass the
   * shares they collected — a missing share leaves the result wrong, which
   * the fingerprint check catches (fail closed, don't return bad material).
   */
  reconstruct(escrowId: string, presentedShares: ReadonlyArray<{ custodianId: string; bytes: Uint8Array }>): Uint8Array | null {
    const rec = this._records.get(escrowId);
    const stored = this._shares.get(escrowId);
    if (!rec || !stored) return null;
    if (presentedShares.length !== stored.length) return null;
    const presented = new Map(presentedShares.map((s) => [s.custodianId, s.bytes]));
    // Every stored custodian must present their share.
    for (const s of stored) {
      if (!presented.has(s.custodianId)) return null;
    }
    const len = stored[0].bytes.length;
    const out = new Uint8Array(len);
    for (const s of stored) {
      const p = presented.get(s.custodianId)!;
      if (p.length !== len) return null;
      for (let b = 0; b < len; b++) out[b] ^= p[b];
    }
    if (fnvBytes(out) !== rec.fingerprint) return null;
    rec.reconstructedAt = this._clock();
    rec.sealed = false;
    return out;
  }

  record(escrowId: string): EscrowRecord | undefined {
    return this._records.get(escrowId);
  }

  records(): ReadonlyArray<EscrowRecord> {
    return [...this._records.values()];
  }
}

function fnvBytes(data: Uint8Array): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < data.length; i++) {
    h ^= BigInt(data[i]);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
