/**
 * PenaltyBox — escalating timeouts for repeat violators.
 *
 * A plain rate limiter says "no" and immediately forgets; an abusive
 * client just retries forever. The penalty box adds *memory*: each
 * violation pushes the offender into a timed-out state, and successive
 * violations *escalate* — timeout duration grows per offense until the
 * offender earns its way back with a clean period.
 *
 * Model (inspired by fail2ban / gaming anti-grief systems):
 *
 * ```
 *   violation N → timeout(N) = base × escalation^(N−1), capped at maxTimeout
 *   clean period: no violations for `resetAfterMs` → offense count resets to 0
 * ```
 *
 * Three violation levels exist because not all offenses are equal:
 * exceeding a rate limit is mild; sending malformed frames or auth
 * failures are worse. `recordViolation(weight)` lets callers charge
 * more than one offense-unit per event — a weight-3 auth failure
 * escalates three times faster than a weight-1 rate overshoot.
 *
 * While an identifier is penalized, {@link isPenalized} is true and
 * {@link remainingMs} reports how long until release. Penalty expiry is
 * lazy — no timers, O(1) per check.
 *
 * Release semantics:
 *  - **Automatic**: after the timeout expires the identifier can act
 *    again, but its offense *count* persists — the next violation
 *    re-escalates from where it left off unless a full `resetAfterMs`
 *    clean window elapsed.
 *  - **Manual**: `pardon` clears everything (operator override).
 *
 * Complexity: all ops O(1); memory O(#tracked identifiers). `sweep`
 * prunes fully-clean entries to keep the map bounded.
 *
 * @module Throttling/Penalty
 */

/** Configuration for escalation geometry. */
export interface PenaltyBoxOptions {
  /** Timeout for the first offense, ms. */
  readonly baseTimeoutMs: number;
  /**
   * Multiplier per additional offense. 2 = exponential doubling;
   * 1 = flat timeout regardless of history.
   */
  readonly escalation?: number;
  /** Ceiling on computed timeouts, ms. */
  readonly maxTimeoutMs: number;
  /**
   * Clean period that forgives the offense count. If no violation occurs
   * for this long *after the last penalty expired*, the offender's count
   * resets to zero.
   */
  readonly resetAfterMs: number;
  readonly now?: () => number;
}

/** Per-identifier penalty record. */
export interface PenaltyRecord {
  /** Escalation level = number of recorded offense units so far. */
  readonly offenseCount: number;
  /** True while `penalizedUntil > now`. */
  readonly penalized: boolean;
  /** Epoch ms when the current penalty ends (0 when not penalized). */
  readonly penalizedUntil: number;
  /** Ms remaining in the current penalty (0 when free). */
  readonly remainingMs: number;
  /** Epoch ms of the most recent violation. */
  readonly lastViolationAt: number;
  /** Epoch ms when offense count forgives (lastViolationAt + resetAfter). */
  readonly cleanAt: number;
  readonly totalViolations: number;
  readonly totalPenaltyMs: number;
}

interface MutablePenalty {
  offenseCount: number;
  penalizedUntil: number;
  lastViolationAt: number;
  totalViolations: number;
  totalPenaltyMs: number;
}

/** Outcome view for {@link PenaltyBox.check} — admission + penalty state. */
export interface PenaltyCheck {
  readonly allowed: boolean;
  readonly remainingMs: number;
  readonly offenseCount: number;
}

export class PenaltyBox {
  private readonly _base: number;
  private readonly _escalation: number;
  private readonly _max: number;
  private readonly _resetAfter: number;
  private readonly _now: () => number;
  private readonly _records = new Map<string, MutablePenalty>();

  constructor(options: PenaltyBoxOptions) {
    if (options.baseTimeoutMs <= 0) throw new Error('baseTimeoutMs must be > 0');
    if (options.maxTimeoutMs < options.baseTimeoutMs) {
      throw new Error('maxTimeoutMs must be >= baseTimeoutMs');
    }
    this._base = options.baseTimeoutMs;
    this._escalation = options.escalation ?? 2;
    this._max = options.maxTimeoutMs;
    this._resetAfter = options.resetAfterMs;
    this._now = options.now ?? (() => Date.now());
  }

  /** Number of identifiers with any history. */
  get trackedCount(): number {
    return this._records.size;
  }

  /** Number of identifiers currently inside a penalty window. */
  get penalizedCount(): number {
    const now = this._now();
    let n = 0;
    for (const r of this._records.values()) {
      if (r.penalizedUntil > now) n++;
    }
    return n;
  }

  /**
   * Is this identifier allowed to act right now? Pure read — does not
   * record anything.
   */
  isPenalized(identifier: string): boolean {
    const r = this._records.get(identifier);
    return r !== undefined && r.penalizedUntil > this._now();
  }

  /** Ms until release (0 when free or unknown). */
  remainingMs(identifier: string): number {
    const r = this._records.get(identifier);
    if (r === undefined) return 0;
    return Math.max(0, r.penalizedUntil - this._now());
  }

  /** Combined check: allowed iff not currently penalized. */
  check(identifier: string): PenaltyCheck {
    const r = this._records.get(identifier);
    const now = this._now();
    if (r === undefined) {
      return { allowed: true, remainingMs: 0, offenseCount: 0 };
    }
    if (r.penalizedUntil <= now) {
      return {
        allowed: true,
        remainingMs: 0,
        offenseCount: this._effectiveOffenses(r, now),
      };
    }
    return {
      allowed: false,
      remainingMs: r.penalizedUntil - now,
      offenseCount: r.offenseCount,
    };
  }

  /**
   * Record a violation. Adds `weight` offense units, then applies a
   * penalty computed at the *new* level:
   *
   *   timeout = min(maxTimeout, base × escalation^(offenseCount−1))
   *
   * If the identifier is already penalized, the new (longer) timeout
   * extends from `now` — stacked, not concurrent.
   *
   * @returns the record after the penalty was applied.
   */
  recordViolation(identifier: string, weight = 1): PenaltyRecord {
    if (weight <= 0) throw new Error('weight must be > 0');
    const now = this._now();
    let r = this._records.get(identifier);
    if (r === undefined) {
      r = {
        offenseCount: 0,
        penalizedUntil: 0,
        lastViolationAt: 0,
        totalViolations: 0,
        totalPenaltyMs: 0,
      };
      this._records.set(identifier, r);
    } else {
      // Clean-period forgiveness: long silence erases the offense count
      // before the new violation lands.
      r.offenseCount = this._effectiveOffenses(r, now);
    }
    r.offenseCount += weight;
    r.lastViolationAt = now;
    r.totalViolations += weight;
    const timeout = this._timeoutFor(r.offenseCount);
    r.penalizedUntil = now + timeout;
    r.totalPenaltyMs += timeout;
    return this._record(r);
  }

  /**
   * Record a *clean* (successful, well-behaved) event. Forgiveness is
   * still driven by violation-silence (see `_effectiveOffenses`), but a
   * touch keeps the record alive in `sweep` and lets dashboards see the
   * identifier is still present.
   */
  recordClean(identifier: string): void {
    const r = this._records.get(identifier);
    if (r !== undefined) {
      r.offenseCount = this._effectiveOffenses(r, this._now());
    }
  }

  /** Forgive an identifier entirely — count, timeout, history. */
  pardon(identifier: string): void {
    this._records.delete(identifier);
  }

  /** Current record for diagnostics (defensive copy). */
  record(identifier: string): PenaltyRecord | null {
    const r = this._records.get(identifier);
    if (r === undefined) return null;
    return this._record(r);
  }

  /**
   * Drop entries that are neither penalized nor holding a live offense
   * count — fully forgiven identifiers. Keeps memory bounded for
   * high-cardinality identifiers. Returns pruned count.
   */
  sweep(): number {
    const now = this._now();
    let pruned = 0;
    for (const [id, r] of [...this._records]) {
      const effective = this._effectiveOffenses(r, now);
      if (r.penalizedUntil <= now && effective === 0) {
        this._records.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  // ------------------------------------------------------------------

  /**
   * Escalation schedule:
   *   offense 1 → base; 2 → base·k; 3 → base·k²; …; capped at max.
   */
  private _timeoutFor(offenseCount: number): number {
    if (offenseCount <= 0) return 0;
    const t = this._base * Math.pow(this._escalation, offenseCount - 1);
    return Math.min(this._max, t);
  }

  /**
   * Offense count after clean-period forgiveness: if the last violation
   * was more than `resetAfterMs` ago, the count has forgiven to 0.
   */
  private _effectiveOffenses(r: MutablePenalty, now: number): number {
    if (r.offenseCount === 0) return 0;
    if (r.lastViolationAt > 0 && now - r.lastViolationAt > this._resetAfter) {
      return 0;
    }
    return r.offenseCount;
  }

  private _record(r: MutablePenalty): PenaltyRecord {
    const now = this._now();
    return {
      offenseCount: this._effectiveOffenses(r, now),
      penalized: r.penalizedUntil > now,
      penalizedUntil: r.penalizedUntil,
      remainingMs: Math.max(0, r.penalizedUntil - now),
      lastViolationAt: r.lastViolationAt,
      cleanAt: r.lastViolationAt + this._resetAfter,
      totalViolations: r.totalViolations,
      totalPenaltyMs: r.totalPenaltyMs,
    };
  }
}
