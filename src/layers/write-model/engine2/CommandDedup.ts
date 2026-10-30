/**
 * CommandDedup — idempotency-key deduplication for commands.
 *
 * Safe retry depends on dedup: a client that times out resubmits the
 * same command with the same idempotency key; the write side must
 * return the original receipt, not re-execute. Two subtleties matter:
 *
 *  - In-flight pinning: the first submission registers the key BEFORE
 *    execution. A duplicate arriving mid-execution gets 'in-flight' —
   *    the caller should poll rather than assume success or failure.
 *  - Same key, different payload: that's a caller bug (key reuse), not a
 *    retry. We fingerprint the payload (FNV-1a over a canonical field
 *    ordering) and report 'conflict' when fingerprints differ.
 *
 * Records carry a TTL: dedup state older than `ttlMs` expires, bounding
 * memory at the cost of losing protection against very-late retries
 * (documented tradeoff; a real store would persist receipts).
 *
 * Complexity: register/check O(1); sweep O(n).
 *
 * @module WriteModelLayer/Engine2
 */

import { WmClock2, SystemWmClock2, WmCommand, CommandReceipt } from './types';

export interface DedupOptions {
  /** How long a dedup record is honored (ms). Default 24h. */
  ttlMs?: number;
  clock?: WmClock2;
}

export type DedupStatus =
  /** First sighting — caller may execute. */
  | 'new'
  /** Same key + same payload, execution finished — return stored receipt. */
  | 'duplicate'
  /** Same key, still executing — caller should poll. */
  | 'in-flight'
  /** Same key, different payload fingerprint — caller bug. */
  | 'conflict';

export interface DedupCheck {
  readonly status: DedupStatus;
  /** Present on 'duplicate': the original receipt. */
  readonly receipt?: CommandReceipt;
  /** True when the record was expired and treated as new. */
  readonly expired?: boolean;
}

interface DedupRecord {
  fingerprint: number;
  receipt: CommandReceipt | null;
  seenAtMs: number;
  done: boolean;
}

/** FNV-1a over canonical JSON — stable payload fingerprint. */
function fingerprint(cmd: WmCommand): number {
  const canon = canonicalize(cmd);
  let h = 0x811c9dc5;
  for (let i = 0; i < canon.length; i++) {
    h ^= canon.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function canonicalize(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(o[k])}`).join(',')}}`;
}

export class CommandDedup {
  private readonly _ttlMs: number;
  private readonly _clock: WmClock2;
  private readonly _records = new Map<string, DedupRecord>();

  constructor(opts: DedupOptions = {}) {
    this._ttlMs = opts.ttlMs ?? 86_400_000;
    this._clock = opts.clock ?? new SystemWmClock2();
  }

  /**
   * Check-and-register in one step (atomic under single-threaded JS).
   * 'new' → caller executes and calls `complete`. 'duplicate' → return
   * the stored receipt. 'in-flight' → caller polls. 'conflict' → caller
   * bug, surface 422.
   */
  check(cmd: WmCommand): DedupCheck {
    const now = this._clock.now();
    const fp = fingerprint(cmd);
    const rec = this._records.get(cmd.idempotencyKey);
    if (!rec) {
      this._records.set(cmd.idempotencyKey, { fingerprint: fp, receipt: null, seenAtMs: now, done: false });
      return { status: 'new' };
    }
    if (now - rec.seenAtMs > this._ttlMs) {
      // Expired record — treat as new (protection window passed).
      this._records.set(cmd.idempotencyKey, { fingerprint: fp, receipt: null, seenAtMs: now, done: false });
      return { status: 'new', expired: true };
    }
    if (rec.fingerprint !== fp) return { status: 'conflict' };
    if (!rec.done) return { status: 'in-flight' };
    return { status: 'duplicate', receipt: rec.receipt ?? undefined };
  }

  /** Mark an in-flight key complete with its receipt. */
  complete(idempotencyKey: string, receipt: CommandReceipt): void {
    const rec = this._records.get(idempotencyKey);
    if (!rec) return;
    rec.receipt = receipt;
    rec.done = true;
  }

  /** Mark an in-flight execution failed — the key may be retried.
   *  Failed executions must be retryable: drop the record so a retry
   *  registers as 'new'. */
  fail(idempotencyKey: string): void {
    this._records.delete(idempotencyKey);
  }

  /** Evict records older than TTL. Returns count removed. */
  sweep(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [k, r] of this._records) {
      if (now - r.seenAtMs > this._ttlMs) {
        this._records.delete(k);
        n++;
      }
    }
    return n;
  }

  get size(): number {
    return this._records.size;
  }
}
