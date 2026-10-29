/**
 * Secrets Rotation — Audit Trail
 *
 * Append-only, hash-chained record of every key lifecycle event. Each entry
 * carries a `prevHash` linking it to the prior entry — tampering with or
 * deleting an entry breaks the chain and is detectable by `verifyIntegrity()`,
 * giving the trail tamper-evidence (not tamper-proofing — a real deployment
 * would also sign or ship the chain off-host).
 *
 * Entries are stored per-secret and globally; queries are O(entries-for-secret).
 *
 * @module SecretsRotation/Rotation
 */

import { RotationAuditEntry, RotationClock } from './RotationTypes';

/** FNV-1a 64-bit — local copy to keep this layer self-contained. */
function fnv1a64(data: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < data.length; i++) {
    hash ^= BigInt(data[i]);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

interface ChainedEntry {
  readonly entry: RotationAuditEntry;
  readonly hash: string;
  readonly prevHash: string;
}

export class AuditTrail {
  private readonly _clock: RotationClock;
  private readonly _entries: ChainedEntry[] = [];
  private _seq = 0;
  private _lastHash = '0'.padStart(16, '0');
  private readonly _bySecret = new Map<string, ChainedEntry[]>();

  constructor(clock: RotationClock = Date.now) {
    this._clock = clock;
  }

  get length(): number {
    return this._entries.length;
  }

  /** Append an event. Returns the assigned sequence number. */
  append(
    secretId: string,
    keyId: string,
    generation: number,
    event: RotationAuditEntry['event'],
    reason: string,
    actor = 'system'
  ): RotationAuditEntry {
    const entry: RotationAuditEntry = {
      seq: this._seq++,
      at: this._clock(),
      secretId,
      keyId,
      generation,
      event,
      reason,
      actor,
    };
    const hash = this._hash(entry, this._lastHash);
    const chained: ChainedEntry = { entry, hash, prevHash: this._lastHash };
    this._entries.push(chained);
    this._lastHash = hash;
    let list = this._bySecret.get(secretId);
    if (!list) {
      list = [];
      this._bySecret.set(secretId, list);
    }
    list.push(chained);
    return entry;
  }

  /** All entries for a secret, oldest first. */
  forSecret(secretId: string): ReadonlyArray<RotationAuditEntry> {
    return (this._bySecret.get(secretId) ?? []).map((c) => c.entry);
  }

  /** All entries globally, oldest first. */
  all(): ReadonlyArray<RotationAuditEntry> {
    return this._entries.map((c) => c.entry);
  }

  /** Entries filtered by event kind. */
  byEvent(event: RotationAuditEntry['event']): ReadonlyArray<RotationAuditEntry> {
    return this._entries.filter((c) => c.entry.event === event).map((c) => c.entry);
  }

  /** Entries inside a time range [fromMs, toMs]. */
  inRange(fromMs: number, toMs: number): ReadonlyArray<RotationAuditEntry> {
    return this._entries
      .filter((c) => c.entry.at >= fromMs && c.entry.at <= toMs)
      .map((c) => c.entry);
  }

  /**
   * Verify the hash chain end-to-end. Returns the index of the first broken
   * link, or -1 when the chain is intact. O(n).
   */
  verifyIntegrity(): { intact: boolean; firstBrokenIndex: number } {
    let prev = '0'.padStart(16, '0');
    for (let i = 0; i < this._entries.length; i++) {
      const c = this._entries[i];
      if (c.prevHash !== prev) return { intact: false, firstBrokenIndex: i };
      const recomputed = this._hash(c.entry, prev);
      if (recomputed !== c.hash) return { intact: false, firstBrokenIndex: i };
      prev = c.hash;
    }
    return { intact: true, firstBrokenIndex: -1 };
  }

  /** Current chain tip hash — publish/anchor this for external verification. */
  get tipHash(): string {
    return this._lastHash;
  }

  private _hash(entry: RotationAuditEntry, prevHash: string): string {
    // Encode the entry deterministically (stable field order).
    const enc = new TextEncoder();
    const payload =
      `${prevHash}|${entry.seq}|${entry.at}|${entry.secretId}|${entry.keyId}|` +
      `${entry.generation}|${entry.event}|${entry.reason}|${entry.actor}`;
    return fnv1a64(enc.encode(payload));
  }
}
