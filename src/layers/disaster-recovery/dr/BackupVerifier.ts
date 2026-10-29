/**
 * Disaster Recovery — Backup Verifier
 *
 * "A backup you haven't restored isn't a backup." The verifier performs a
 * full simulated restore: it re-reads the stored payload, recomputes the
 * integrity checksum with the declared algorithm, and compares it to the
 * recorded digest. It also sanity-checks structural metadata (size match,
 * position monotonicity vs prior backups of the same service).
 *
 * Verification results feed two decisions:
 *   - is this artifact usable as a recovery point?
 *   - is the backup pipeline itself healthy (rolling verification pass rate)?
 *
 * Storage is injectable (`fetchPayload`) so the verifier works against any
 * backing store in tests; a default in-memory store is provided.
 *
 * @module DisasterRecovery/DR
 */

import { BackupArtifact, BackupVerificationResult, DrClock } from './DrTypes';
import { checksum } from './IntegrityChecksum';

/** Storage boundary the verifier reads artifacts through. */
export interface BackupStore {
  fetchPayload(backupId: string): Promise<Uint8Array | null> | Uint8Array | null;
  fetchMetadata(backupId: string): Promise<BackupArtifact | null> | BackupArtifact | null;
}

/** Simple in-memory store — default for tests/dev. */
export class InMemoryBackupStore implements BackupStore {
  private readonly _artifacts = new Map<string, BackupArtifact>();

  put(artifact: BackupArtifact): void {
    this._artifacts.set(artifact.backupId, artifact);
  }

  /** Corrupt the stored payload in place (for tests). */
  corrupt(backupId: string, offset: number): void {
    const a = this._artifacts.get(backupId);
    if (!a || offset >= a.payload.length) return;
    a.payload[offset] ^= 0xff;
  }

  fetchPayload(backupId: string): Uint8Array | null {
    const a = this._artifacts.get(backupId);
    return a ? a.payload : null;
  }

  fetchMetadata(backupId: string): BackupArtifact | null {
    return this._artifacts.get(backupId) ?? null;
  }
}

export class BackupVerifier {
  private readonly _store: BackupStore;
  private readonly _clock: DrClock;
  private readonly _results: BackupVerificationResult[] = [];
  private readonly _lastPosition = new Map<string, bigint>();

  constructor(store: BackupStore, clock: DrClock = Date.now) {
    this._store = store;
    this._clock = clock;
  }

  get history(): ReadonlyArray<BackupVerificationResult> {
    return this._results;
  }

  /** Rolling pass rate over the last `n` verifications (default all). */
  passRate(n?: number): number {
    const slice = n === undefined ? this._results : this._results.slice(-n);
    if (slice.length === 0) return 1;
    return slice.filter((r) => r.verified).length / slice.length;
  }

  /**
   * Verify one backup: fetch metadata + payload, recompute checksum, compare.
   * Never throws for corrupt data — corruption IS the thing being measured;
   * only structural anomalies surface as `verified:false` with an error note.
   */
  async verify(backupId: string): Promise<BackupVerificationResult> {
    const started = this._clock();
    const finish = (r: Omit<BackupVerificationResult, 'durationMs'>): BackupVerificationResult => {
      const result: BackupVerificationResult = { ...r, durationMs: this._clock() - started };
      this._results.push(result);
      return result;
    };

    const meta = await this._store.fetchMetadata(backupId);
    if (!meta) {
      return finish({
        backupId,
        verified: false,
        expectedChecksum: '',
        actualChecksum: '',
        restoredBytes: 0,
        error: 'metadata not found',
      });
    }
    const payload = await this._store.fetchPayload(backupId);
    if (!payload) {
      return finish({
        backupId,
        verified: false,
        expectedChecksum: meta.checksum,
        actualChecksum: '',
        restoredBytes: 0,
        error: 'payload not found',
      });
    }

    if (payload.length !== meta.sizeBytes) {
      return finish({
        backupId,
        verified: false,
        expectedChecksum: meta.checksum,
        actualChecksum: checksum(meta.checksumKind, payload),
        restoredBytes: payload.length,
        error: `size mismatch: expected ${meta.sizeBytes}B got ${payload.length}B`,
      });
    }

    // Position regression guard: a backup older than the last verified one
    // for the same service can't extend the recovery point forward.
    const lastPos = this._lastPosition.get(meta.serviceId);
    const positionRegressed = lastPos !== undefined && meta.position < lastPos;

    const actual = checksum(meta.checksumKind, payload);
    const verified = actual === meta.checksum && !positionRegressed;
    if (verified) {
      this._lastPosition.set(meta.serviceId, meta.position);
    }

    return finish({
      backupId,
      verified,
      expectedChecksum: meta.checksum,
      actualChecksum: actual,
      restoredBytes: payload.length,
      error: verified
        ? undefined
        : actual !== meta.checksum
          ? 'checksum mismatch — payload corrupt'
          : 'position regressed vs previous verified backup',
    });
  }

  /** Verify many backups; returns aggregate pass/fail. */
  async verifyAll(backupIds: ReadonlyArray<string>): Promise<{
    total: number;
    passed: number;
    results: ReadonlyArray<BackupVerificationResult>;
  }> {
    const results: BackupVerificationResult[] = [];
    for (const id of backupIds) {
      results.push(await this.verify(id));
    }
    return {
      total: results.length,
      passed: results.filter((r) => r.verified).length,
      results,
    };
  }
}

/**
 * Helper: build an artifact with a correctly-computed checksum. The payload
 * is defensively copied so later mutation of the caller's buffer can't
 * silently corrupt the stored backup.
 */
export function makeArtifact(
  backupId: string,
  serviceId: string,
  position: bigint,
  payload: Uint8Array,
  kind: 'fnv1a' | 'sha256-sim',
  createdAt: number
): BackupArtifact {
  const stored = Uint8Array.from(payload);
  return {
    backupId,
    serviceId,
    position,
    createdAt,
    sizeBytes: stored.length,
    checksum: checksum(kind, stored),
    checksumKind: kind,
    payload: stored,
  };
}
