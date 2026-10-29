/**
 * Dead-Letter Queue Manager
 *
 * A complete DLQ subsystem:
 * - **Routing rules**: per-queue policy controlling when a failed message is
 *   retried vs dead-lettered (max retries, per-error-class rules, poison
 *   message detection via repeated failure signatures)
 * - **Retry scheduling**: exponential backoff with configurable base,
 *   multiplier, cap and full/decorrelated jitter; messages are re-queued only
 *   when their backoff elapses
 * - **Inspection**: browse the DLQ without dequeuing (peek), filter by
 *   reason/source queue/time range
 * - **Replay**: single-message or batch replay back to a target handler,
 *   with optional sanitization hooks; replay preserves original headers and
 *   stamps replay metadata
 * - **Purge policies**: TTL (drop entries older than X) and max-size
 *   (FIFO/oldest-first eviction) enforced on write and via `enforcePurge()`
 * - **Alert hooks**: subscribers fired when DLQ depth crosses configured
 *   thresholds (rising edge, with hysteresis to avoid flapping)
 *
 * Time model: all scheduling is *logical* — `processRetries(now)` is called by
 * the owner (or tests) with a timestamp, making the manager fully
 * deterministic and timer-free.
 *
 * @module DeadLetterLayer/Implementations
 */

// ============================================================================
// Types
// ============================================================================

/** A message that failed processing and is being retried or dead-lettered. */
export interface DeadLetterRecord<T = unknown> {
  /** Unique DLQ entry id. */
  readonly id: string;
  /** Original queue/topic the message came from. */
  readonly sourceQueue: string;
  /** Original message payload. */
  readonly payload: T;
  /** Original headers (immutable snapshot). */
  readonly headers: Readonly<Record<string, string>>;
  /** Failure history: newest last. */
  readonly failures: readonly FailureEntry[];
  /** When the record entered the DLQ (ms epoch). */
  readonly deadLetteredAt: number;
  /** Why it was dead-lettered. */
  readonly reason: DeadLetterReason;
  /** Number of delivery attempts total. */
  readonly attempts: number;
}

export interface FailureEntry {
  readonly at: number;
  readonly error: string;
  /** Optional error class/category for rule matching. */
  readonly errorClass?: string;
}

export type DeadLetterReason =
  | 'max-retries'
  | 'poison'
  | 'expired'
  | 'explicit'
  | 'rule';

/** Message as presented to a processing handler. */
export interface WorkItem<T = unknown> {
  readonly id: string;
  readonly queue: string;
  readonly payload: T;
  readonly headers: Record<string, string>;
  /** Previous failures for this item (empty on first attempt). */
  readonly priorFailures: readonly FailureEntry[];
}

// ============================================================================
// Retry policy
// ============================================================================

export type JitterMode = 'none' | 'full' | 'equal' | 'decorrelated';

export interface RetryPolicy {
  /** Max retry attempts before dead-lettering (total attempts = maxRetries + 1). */
  readonly maxRetries: number;
  /** Base delay for attempt 1. */
  readonly baseDelayMs: number;
  /** Exponential multiplier. Default: 2. */
  readonly multiplier?: number;
  /** Cap on computed delay. */
  readonly maxDelayMs?: number;
  readonly jitter?: JitterMode;
  /** PRNG seed injection point for deterministic tests. */
  readonly random?: () => number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 100,
  multiplier: 2,
  maxDelayMs: 30000,
  jitter: 'full',
};

/**
 * Compute the backoff delay before retry `attempt` (1-based).
 *
 * Strategies:
 * - `none`:  base * mult^(n-1), capped
 * - `full`:  random in [0, exponential]
 * - `equal`: exponential/2 + random in [0, exponential/2]
 * - `decorrelated`: random in [base, prevDelay * 3], capped (AWS-style)
 */
export function computeBackoff(
  attempt: number,
  policy: RetryPolicy,
  previousDelayMs?: number
): number {
  const mult = policy.multiplier ?? 2;
  const cap = policy.maxDelayMs ?? Number.POSITIVE_INFINITY;
  const rand = policy.random ?? Math.random;

  const exponential = Math.min(cap, policy.baseDelayMs * Math.pow(mult, attempt - 1));

  switch (policy.jitter ?? 'full') {
    case 'none':
      return exponential;
    case 'full':
      return Math.floor(rand() * exponential);
    case 'equal': {
      const half = exponential / 2;
      return Math.floor(half + rand() * half);
    }
    case 'decorrelated': {
      const prev = previousDelayMs ?? policy.baseDelayMs;
      return Math.min(cap, Math.floor(policy.baseDelayMs + rand() * (prev * 3 - policy.baseDelayMs)));
    }
  }
}

// ============================================================================
// Routing rules
// ============================================================================

/**
 * A rule deciding whether a failed message should be retried or sent to the
 * DLQ immediately. Rules are evaluated in order; first match wins.
 */
export interface DeadLetterRule {
  readonly name: string;
  /** Return true if the rule applies to this failure. */
  matches(failure: FailureEntry, item: WorkItem): boolean;
  /** What to do when matched. */
  action: 'retry' | 'dead-letter';
  /** For action='retry', override the retry policy. */
  retryPolicy?: RetryPolicy;
  /** For action='dead-letter', the recorded reason. */
  reason?: DeadLetterReason;
}

/** Convenience: dead-letter immediately on a given error class. */
export function failFastOnErrorClass(errorClass: string, name?: string): DeadLetterRule {
  return {
    name: name ?? `fail-fast:${errorClass}`,
    matches: (f) => f.errorClass === errorClass,
    action: 'dead-letter',
    reason: 'rule',
  };
}

/** Convenience: always retry on transient error class. */
export function alwaysRetryOn(errorClass: string, policy?: RetryPolicy): DeadLetterRule {
  return {
    name: `always-retry:${errorClass}`,
    matches: (f) => f.errorClass === errorClass,
    action: 'retry',
    retryPolicy: policy,
  };
}

// ============================================================================
// Poison message detection
// ============================================================================

export interface PoisonDetectionConfig {
  /** Enable signature-based poison detection. */
  readonly enabled: boolean;
  /** Distinct error classes seen across failures to classify as poison. */
  readonly distinctErrorClassesThreshold?: number;
  /** Total failures (regardless of class) to classify as poison. */
  readonly totalFailuresThreshold?: number;
  /** Pattern (regex source) in error message => poison. */
  readonly errorMessagePattern?: string;
}

/**
 * Decide whether a failure history looks like a poison message — i.e. it
 * will never succeed no matter how many times it is retried.
 */
export function isPoisonMessage(
  failures: readonly FailureEntry[],
  config: PoisonDetectionConfig
): boolean {
  if (!config.enabled || failures.length === 0) return false;

  if (
    config.totalFailuresThreshold !== undefined &&
    failures.length >= config.totalFailuresThreshold
  ) {
    return true;
  }

  if (config.distinctErrorClassesThreshold !== undefined) {
    const classes = new Set(failures.map((f) => f.errorClass ?? ''));
    if (classes.size >= config.distinctErrorClassesThreshold) return true;
  }

  if (config.errorMessagePattern !== undefined) {
    const re = new RegExp(config.errorMessagePattern, 'i');
    if (failures.some((f) => re.test(f.error))) return true;
  }

  return false;
}

// ============================================================================
// Alerts
// ============================================================================

export interface DepthThreshold {
  /** Fire when DLQ depth rises to or above this value. */
  readonly depth: number;
  readonly name?: string;
}

export type AlertHook = (event: {
  threshold: DepthThreshold;
  currentDepth: number;
  crossed: 'up' | 'down';
}) => void;

// ============================================================================
// The manager
// ============================================================================

interface PendingRetry<T> {
  readonly item: WorkItem<T>;
  readonly dueAt: number;
  readonly failures: FailureEntry[];
  readonly lastDelayMs: number;
  readonly policy: RetryPolicy;
}

export interface DeadLetterQueueConfig {
  /** Default retry policy when no rule overrides it. */
  readonly retryPolicy?: RetryPolicy;
  /** Rules evaluated in order before the default max-retries check. */
  readonly rules?: readonly DeadLetterRule[];
  readonly poisonDetection?: PoisonDetectionConfig;
  /** TTL for DLQ records (ms); expired records are purged. */
  readonly recordTtlMs?: number;
  /** Max DLQ size; oldest records are evicted beyond this. */
  readonly maxRecords?: number;
  /** Depth thresholds that fire alert hooks (ascending order). */
  readonly alertThresholds?: readonly DepthThreshold[];
}

export interface ReplayResult {
  replayed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export interface BrowseFilter {
  sourceQueue?: string;
  reason?: DeadLetterReason;
  deadLetteredAfter?: number;
  deadLetteredBefore?: number;
  limit?: number;
  offset?: number;
}

let nextDlqId = 0;
let nextRetryId = 0;

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(nextDlqId++).toString(36)}`;
}

export class DeadLetterQueue<T = unknown> {
  private readonly _config: DeadLetterQueueConfig;
  private readonly _records: DeadLetterRecord<T>[] = [];
  private readonly _pendingRetries = new Map<string, PendingRetry<T>>();
  private readonly _alertHooks: AlertHook[] = [];
  /** Tracks which thresholds have fired (rising edge) for hysteresis. */
  private readonly _thresholdState = new Map<number, boolean>();
  private _totalDeadLettered = 0;
  private _totalPurged = 0;
  private _totalReplayed = 0;

  constructor(config: DeadLetterQueueConfig = {}) {
    this._config = config;
    for (const t of config.alertThresholds ?? []) {
      this._thresholdState.set(t.depth, false);
    }
  }

  // ------------------------------------------------------------ intake

  /**
   * Process a work item through `handler`. On failure, schedules a retry
   * (if permitted) or routes to the DLQ.
   *
   * @returns `'processed' | 'retry-scheduled' | 'dead-lettered'`
   */
  async process(
    item: WorkItem<T>,
    handler: (item: WorkItem<T>) => Promise<void>,
    now = Date.now()
  ): Promise<'processed' | 'retry-scheduled' | 'dead-lettered'> {
    try {
      await handler(item);
      return 'processed';
    } catch (err) {
      const failure: FailureEntry = {
        at: now,
        error: err instanceof Error ? err.message : String(err),
        errorClass: err instanceof Error ? err.name : 'Error',
      };
      return this._handleFailure(item, failure, now);
    }
  }

  /**
   * Record an external failure (when the caller handles execution itself).
   * Schedules retry or dead-letters per the rules.
   */
  recordFailure(
    item: WorkItem<T>,
    error: { message: string; errorClass?: string },
    now = Date.now()
  ): 'retry-scheduled' | 'dead-lettered' {
    const failure: FailureEntry = {
      at: now,
      error: error.message,
      errorClass: error.errorClass,
    };
    return this._handleFailure(item, failure, now);
  }

  private _handleFailure(
    item: WorkItem<T>,
    failure: FailureEntry,
    now: number
  ): 'retry-scheduled' | 'dead-lettered' {
    const failures = [...item.priorFailures, failure];

    // 1. Poison detection short-circuits everything.
    if (
      this._config.poisonDetection?.enabled &&
      isPoisonMessage(failures, this._config.poisonDetection)
    ) {
      this._deadLetter(item, failures, 'poison', now);
      return 'dead-lettered';
    }

    // 2. Rules, in order.
    for (const rule of this._config.rules ?? []) {
      if (rule.matches(failure, item)) {
        if (rule.action === 'dead-letter') {
          this._deadLetter(item, failures, rule.reason ?? 'rule', now);
          return 'dead-lettered';
        }
        return this._scheduleRetry(item, failures, rule.retryPolicy, now);
      }
    }

    // 3. Default policy: retry up to maxRetries.
    const policy = this._config.retryPolicy ?? DEFAULT_RETRY_POLICY;
    const attemptsSoFar = failures.length; // 1 failure per attempt
    if (attemptsSoFar <= policy.maxRetries) {
      return this._scheduleRetry(item, failures, policy, now);
    }
    this._deadLetter(item, failures, 'max-retries', now);
    return 'dead-lettered';
  }

  private _scheduleRetry(
    item: WorkItem<T>,
    failures: FailureEntry[],
    policyOverride: RetryPolicy | undefined,
    now: number
  ): 'retry-scheduled' {
    const policy = policyOverride ?? this._config.retryPolicy ?? DEFAULT_RETRY_POLICY;
    const lastPending = this._pendingRetries.get(item.id);
    const delay = computeBackoff(failures.length, policy, lastPending?.lastDelayMs);
    const pending: PendingRetry<T> = {
      item: { ...item, priorFailures: failures },
      dueAt: now + delay,
      failures,
      lastDelayMs: delay,
      policy,
    };
    this._pendingRetries.set(item.id, pending);
    return 'retry-scheduled';
  }

  /**
   * Run all retries whose backoff has elapsed through `handler`.
   * Deterministic: driven entirely by the `now` argument.
   *
   * @returns items that were actually re-attempted
   */
  async processRetries(
    handler: (item: WorkItem<T>) => Promise<void>,
    now = Date.now()
  ): Promise<WorkItem<T>[]> {
    const due: PendingRetry<T>[] = [];
    for (const [id, p] of this._pendingRetries) {
      if (p.dueAt <= now) {
        this._pendingRetries.delete(id);
        due.push(p);
      }
    }
    const attempted: WorkItem<T>[] = [];
    for (const p of due) {
      attempted.push(p.item);
      const result = await this.process(p.item, handler, now);
      // Keep the previous delay for decorrelated jitter continuity.
      if (result === 'retry-scheduled') {
        const cur = this._pendingRetries.get(p.item.id);
        if (cur) {
          this._pendingRetries.set(p.item.id, { ...cur, lastDelayMs: p.lastDelayMs });
        }
      }
    }
    return attempted;
  }

  /** Number of messages waiting on their backoff. */
  get pendingRetryCount(): number {
    return this._pendingRetries.size;
  }

  /** Peek at pending retries (without running them). */
  pendingRetries(): readonly PendingRetry<T>[] {
    return [...this._pendingRetries.values()];
  }

  // ------------------------------------------------------------------ DLQ

  private _deadLetter(
    item: WorkItem<T>,
    failures: FailureEntry[],
    reason: DeadLetterReason,
    now: number
  ): void {
    const record: DeadLetterRecord<T> = {
      id: genId('dlq'),
      sourceQueue: item.queue,
      payload: item.payload,
      headers: { ...item.headers },
      failures,
      deadLetteredAt: now,
      reason,
      attempts: failures.length,
    };
    this._records.push(record);
    this._totalDeadLettered++;
    this._enforceMaxSize();
    this._checkAlerts();
  }

  /**
   * Browse DLQ records without removing them.
   */
  browse(filter: BrowseFilter = {}): readonly DeadLetterRecord<T>[] {
    let out = this._records.slice();
    if (filter.sourceQueue !== undefined) {
      out = out.filter((r) => r.sourceQueue === filter.sourceQueue);
    }
    if (filter.reason !== undefined) {
      out = out.filter((r) => r.reason === filter.reason);
    }
    if (filter.deadLetteredAfter !== undefined) {
      out = out.filter((r) => r.deadLetteredAt >= filter.deadLetteredAfter!);
    }
    if (filter.deadLetteredBefore !== undefined) {
      out = out.filter((r) => r.deadLetteredAt <= filter.deadLetteredBefore!);
    }
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? out.length;
    return out.slice(offset, offset + limit);
  }

  get depth(): number {
    return this._records.length;
  }

  /** Look up a single record by id. */
  peek(id: string): DeadLetterRecord<T> | undefined {
    return this._records.find((r) => r.id === id);
  }

  // ----------------------------------------------------------------- replay

  /**
   * Replay a single DLQ record through `handler`. On success the record is
   * removed; on failure it is re-added with the new failure appended (and the
   * error is returned in the result, not thrown).
   */
  async replayOne(
    id: string,
    handler: (item: WorkItem<T>) => Promise<void>,
    now = Date.now()
  ): Promise<{ ok: boolean; error?: string }> {
    const idx = this._records.findIndex((r) => r.id === id);
    if (idx < 0) return { ok: false, error: `record ${id} not found` };
    const record = this._records[idx];
    const item: WorkItem<T> = {
      id: record.id,
      queue: record.sourceQueue,
      payload: record.payload,
      headers: {
        ...record.headers,
        'x-dlq-replayed': 'true',
        'x-dlq-replay-at': String(now),
        'x-dlq-original-dead-lettered-at': String(record.deadLetteredAt),
      },
      priorFailures: record.failures,
    };
    try {
      await handler(item);
      this._records.splice(idx, 1);
      this._totalReplayed++;
      this._checkAlerts();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Append the replay failure to history; keep the record in the DLQ.
      const failure: FailureEntry = {
        at: now,
        error: `replay: ${msg}`,
        errorClass: err instanceof Error ? err.name : 'Error',
      };
      this._records[idx] = { ...record, failures: [...record.failures, failure] };
      return { ok: false, error: msg };
    }
  }

  /**
   * Replay multiple records (optionally filtered) through `handler`.
   * Each record is processed independently — failures don't abort the batch.
   */
  async replayBatch(
    handler: (item: WorkItem<T>) => Promise<void>,
    filter: BrowseFilter = {},
    now = Date.now()
  ): Promise<ReplayResult> {
    const targets = this.browse(filter);
    const result: ReplayResult = { replayed: 0, succeeded: 0, failed: 0, errors: [] };
    for (const r of targets) {
      result.replayed++;
      const res = await this.replayOne(r.id, handler, now);
      if (res.ok) result.succeeded++;
      else {
        result.failed++;
        result.errors.push({ id: r.id, error: res.error ?? 'unknown' });
      }
    }
    return result;
  }

  // ------------------------------------------------------------------ purge

  /**
   * Apply purge policies: TTL expiry then max-size eviction.
   * Called automatically on dead-letter insert; call manually to enforce TTL
   * between inserts.
   * @returns number of records removed
   */
  enforcePurge(now = Date.now()): number {
    let removed = 0;
    // TTL purge
    if (this._config.recordTtlMs !== undefined) {
      const cutoff = now - this._config.recordTtlMs;
      for (let i = this._records.length - 1; i >= 0; i--) {
        if (this._records[i].deadLetteredAt < cutoff) {
          this._records.splice(i, 1);
          removed++;
        }
      }
    }
    removed += this._enforceMaxSize();
    if (removed > 0) {
      this._totalPurged += removed;
      this._checkAlerts();
    }
    return removed;
  }

  /** Evict oldest records beyond maxRecords. Returns number evicted. */
  private _enforceMaxSize(): number {
    const max = this._config.maxRecords;
    if (max === undefined || this._records.length <= max) return 0;
    const excess = this._records.length - max;
    this._records.splice(0, excess);
    this._totalPurged += excess;
    return excess;
  }

  // ----------------------------------------------------------------- alerts

  onAlert(hook: AlertHook): void {
    this._alertHooks.push(hook);
  }

  private _checkAlerts(): void {
    const depth = this._records.length;
    for (const t of this._config.alertThresholds ?? []) {
      const fired = this._thresholdState.get(t.depth) ?? false;
      if (!fired && depth >= t.depth) {
        this._thresholdState.set(t.depth, true);
        this._fire(t, depth, 'up');
      } else if (fired && depth < t.depth) {
        // Hysteresis: reset only when depth drops strictly below threshold.
        this._thresholdState.set(t.depth, false);
        this._fire(t, depth, 'down');
      }
    }
  }

  private _fire(threshold: DepthThreshold, depth: number, crossed: 'up' | 'down'): void {
    for (const hook of this._alertHooks) {
      try {
        hook({ threshold, currentDepth: depth, crossed });
      } catch {
        // alert hooks must never break the DLQ
      }
    }
  }

  // ------------------------------------------------------------------ stats

  stats(): {
    depth: number;
    pendingRetries: number;
    totalDeadLettered: number;
    totalPurged: number;
    totalReplayed: number;
    byReason: Record<string, number>;
    bySourceQueue: Record<string, number>;
  } {
    const byReason: Record<string, number> = {};
    const byQueue: Record<string, number> = {};
    for (const r of this._records) {
      byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
      byQueue[r.sourceQueue] = (byQueue[r.sourceQueue] ?? 0) + 1;
    }
    return {
      depth: this._records.length,
      pendingRetries: this._pendingRetries.size,
      totalDeadLettered: this._totalDeadLettered,
      totalPurged: this._totalPurged,
      totalReplayed: this._totalReplayed,
      byReason,
      bySourceQueue: byQueue,
    };
  }
}

export { genId as _genDlqId };
