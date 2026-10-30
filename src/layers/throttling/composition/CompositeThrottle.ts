/**
 * CompositeThrottle — combine multiple admission strategies with
 * boolean semantics (ALL must pass = AND; ANY passes = OR) and
 * per-strategy metrics.
 *
 * Real systems stack limits: "100 req/s AND ≤ 50 concurrent AND not in
 * the penalty box AND under daily quota". Each clause is a *gate*; this
 * composite evaluates them under one decision and reports which gate
 * rejected (for Retry-After and for dashboards).
 *
 * The tricky part of AND-composition is *partial consumption*: gates
 * like token buckets consume capacity on success, so if gate 3 fails,
 * gates 1–2 already spent tokens that conceptually belong to a rejected
 * request. The fix is a transactional protocol:
 *
 *   1. Evaluate gates in order; each `tryPass` that succeeds is recorded.
 *   2. First failure → call `undo()` on every previously-passed gate
 *      that supports it (bucket refunds tokens, concurrency gate
 *      releases the permit).
 *   3. Gates that can't undo are documented as best-effort — order
 *      non-refundable gates last to minimize leakage.
 *
 * OR-composition evaluates until the first pass — later gates are never
 * touched, so there is no leakage.
 *
 * `evaluateAll` mode (default false): run every gate even after a
 * failure, for complete per-gate rejection metrics; undo still applies
 * to passed gates.
 *
 * Complexity: `admit` is O(#gates); each gate O(1).
 *
 * @module Throttling/Composition
 */

/* ------------------------------------------------------------------ */
/* Gate contract                                                       */
/* ------------------------------------------------------------------ */

/** Result of one gate evaluation. */
export interface GateResult {
  readonly passed: boolean;
  /** ms until this gate would pass (0 when passed or unknowable). */
  readonly retryAfterMs?: number;
  /** Machine-readable rejection reason, e.g. 'bucket-empty'. */
  readonly reason?: string;
}

/**
 * One admission gate. Implementations must be synchronous — composition
 * is a hot-path decision; async belongs behind a QueueThrottle.
 */
export interface ThrottleGate {
  readonly name: string;
  /**
   * Evaluate the gate. On `passed: true` the gate may have consumed
   * capacity — the caller must either proceed or call {@link undo}.
   */
  tryPass(cost?: number): GateResult;
  /**
   * Roll back the *last* successful `tryPass` on this gate. Optional —
   * gates that can't refund simply omit it.
   */
  undo?(): void;
}

/** Per-gate counters the composite maintains. */
export interface GateMetrics {
  readonly name: string;
  readonly evaluated: number;
  readonly passed: number;
  readonly rejected: number;
  /** Undos applied due to a later gate's rejection. */
  readonly rolledBack: number;
}

/** Composite admission decision. */
export interface CompositeDecision {
  readonly allowed: boolean;
  /** Names of gates that rejected, in evaluation order. */
  readonly rejectedBy: readonly string[];
  /** Max retryAfterMs among rejecting gates — for Retry-After. */
  readonly retryAfterMs: number;
}

export type CompositeMode = 'all' | 'any';

export interface CompositeThrottleOptions {
  readonly mode: CompositeMode;
  /** Keep evaluating after a decision is already determined. Default false. */
  readonly evaluateAll?: boolean;
}

export class CompositeThrottle {
  private readonly _mode: CompositeMode;
  private readonly _evaluateAll: boolean;
  private readonly _gates: ThrottleGate[] = [];
  private readonly _metrics = new Map<string, { evaluated: number; passed: number; rejected: number; rolledBack: number }>();

  constructor(options: CompositeThrottleOptions, gates: readonly ThrottleGate[] = []) {
    this._mode = options.mode;
    this._evaluateAll = options.evaluateAll ?? false;
    for (const g of gates) this.addGate(g);
  }

  /** Append a gate (order matters — see class docs). */
  addGate(gate: ThrottleGate): this {
    if (this._gates.some((g) => g.name === gate.name)) {
      throw new Error(`duplicate gate name: ${gate.name}`);
    }
    this._gates.push(gate);
    this._metrics.set(gate.name, { evaluated: 0, passed: 0, rejected: 0, rolledBack: 0 });
    return this;
  }

  get gateCount(): number {
    return this._gates.length;
  }

  /**
   * Evaluate the composition.
   *
   *  - `all`: every gate must pass. Short-circuits on first failure
   *    (unless evaluateAll) and undoes earlier passes.
   *  - `any`: first pass wins — remaining gates unevaluated.
   */
  admit(cost?: number): CompositeDecision {
    const passed: ThrottleGate[] = [];
    const rejectedBy: string[] = [];
    let retryAfterMs = 0;

    for (const gate of this._gates) {
      const m = this._metrics.get(gate.name) as { evaluated: number; passed: number; rejected: number; rolledBack: number };
      const decisionDetermined =
        !this._evaluateAll &&
        ((this._mode === 'any' && passed.length > 0) ||
          (this._mode === 'all' && rejectedBy.length > 0));
      if (decisionDetermined) break;

      m.evaluated++;
      const res = gate.tryPass(cost);
      if (res.passed) {
        m.passed++;
        passed.push(gate);
      } else {
        m.rejected++;
        rejectedBy.push(gate.name);
        retryAfterMs = Math.max(retryAfterMs, res.retryAfterMs ?? 0);
      }
    }

    const allowed =
      this._mode === 'all' ? rejectedBy.length === 0 && this._gates.length > 0 : passed.length > 0;

    // AND-failure rollback: undo everything that consumed capacity.
    if (!allowed && this._mode === 'all') {
      for (const gate of passed) {
        if (gate.undo !== undefined) {
          try {
            gate.undo();
            const m = this._metrics.get(gate.name) as { rolledBack: number };
            m.rolledBack++;
          } catch {
            // A failed undo leaks capacity — unavoidable; don't mask it
            // by swallowing silently in production, but a throwing undo
            // must not break the decision path.
          }
        }
      }
    }

    return { allowed, rejectedBy, retryAfterMs };
  }

  /** Per-gate metrics snapshot, in gate order. */
  metrics(): GateMetrics[] {
    return this._gates.map((g) => ({
      name: g.name,
      ...(this._metrics.get(g.name) as { evaluated: number; passed: number; rejected: number; rolledBack: number }),
    }));
  }
}

/* ------------------------------------------------------------------ */
/* Built-in gates                                                      */
/* ------------------------------------------------------------------ */

/**
 * Token-bucket gate — lazy-refill bucket identical in semantics to
 * `TokenBucketStrategy`, with `undo` support: a refunded acquire returns
 * `cost` tokens (capped at capacity).
 */
export class TokenBucketGate implements ThrottleGate {
  readonly name: string;
  private readonly _ratePerSec: number;
  private readonly _capacity: number;
  private readonly _now: () => number;
  private _tokens: number;
  private _lastRefillAt: number;
  private _lastCost = 0;
  private _undoable = false;

  constructor(
    name: string,
    options: { ratePerSec: number; capacity?: number; now?: () => number }
  ) {
    if (options.ratePerSec <= 0) throw new Error('ratePerSec must be > 0');
    this.name = name;
    this._ratePerSec = options.ratePerSec;
    this._capacity = options.capacity ?? options.ratePerSec;
    this._now = options.now ?? (() => Date.now());
    this._tokens = this._capacity;
    this._lastRefillAt = this._now();
  }

  tryPass(cost = 1): GateResult {
    this._refill();
    if (this._tokens >= cost) {
      this._tokens -= cost;
      this._lastCost = cost;
      this._undoable = true;
      return { passed: true };
    }
    this._undoable = false;
    return {
      passed: false,
      retryAfterMs: ((cost - this._tokens) / this._ratePerSec) * 1000,
      reason: 'bucket-empty',
    };
  }

  /** Refund the last successful consume. */
  undo(): void {
    if (!this._undoable) return;
    this._refill();
    this._tokens = Math.min(this._capacity, this._tokens + this._lastCost);
    this._undoable = false;
  }

  get tokens(): number {
    this._refill();
    return this._tokens;
  }

  private _refill(): void {
    const now = this._now();
    const elapsed = (now - this._lastRefillAt) / 1000;
    if (elapsed > 0) {
      this._tokens = Math.min(this._capacity, this._tokens + elapsed * this._ratePerSec);
      this._lastRefillAt = now;
    }
  }
}

/**
 * Concurrency gate — a non-blocking semaphore. `tryPass` takes a permit
 * if `inFlight < max`; `undo` returns it. Pair with `release()` at the
 * end of the admitted work (the composite only handles admission).
 */
export class ConcurrencyGate implements ThrottleGate {
  readonly name: string;
  private readonly _max: number;
  private _inFlight = 0;
  private _undoable = false;

  constructor(name: string, options: { maxConcurrent: number }) {
    if (options.maxConcurrent <= 0) throw new Error('maxConcurrent must be > 0');
    this.name = name;
    this._max = options.maxConcurrent;
  }

  get inFlight(): number {
    return this._inFlight;
  }

  tryPass(): GateResult {
    if (this._inFlight < this._max) {
      this._inFlight++;
      this._undoable = true;
      return { passed: true };
    }
    this._undoable = false;
    return { passed: false, reason: 'at-capacity' };
  }

  undo(): void {
    if (!this._undoable) return;
    this._inFlight--;
    this._undoable = false;
  }

  /** Return the permit at end of work — NOT the same as undo(). */
  release(): void {
    if (this._inFlight <= 0) throw new Error('release without a held permit');
    this._inFlight--;
  }
}

/**
 * Fixed-window gate — per-identifier-less counter bucketed by
 * `floor(now/window)`. Non-refundable (a logged hit can't be un-logged);
 * keep it late in AND chains.
 */
export class FixedWindowGate implements ThrottleGate {
  readonly name: string;
  private readonly _limit: number;
  private readonly _windowMs: number;
  private readonly _now: () => number;
  private _windowStart: number;
  private _count = 0;

  constructor(name: string, options: { limit: number; windowMs: number; now?: () => number }) {
    if (options.limit <= 0 || options.windowMs <= 0) throw new Error('invalid window config');
    this.name = name;
    this._limit = options.limit;
    this._windowMs = options.windowMs;
    this._now = options.now ?? (() => Date.now());
    this._windowStart = this._currentWindow();
  }

  tryPass(cost = 1): GateResult {
    this._roll();
    if (this._count + cost <= this._limit) {
      this._count += cost;
      return { passed: true };
    }
    return {
      passed: false,
      retryAfterMs: this._windowStart + this._windowMs - this._now(),
      reason: 'window-exhausted',
    };
  }

  get count(): number {
    this._roll();
    return this._count;
  }

  private _currentWindow(): number {
    return this._now() - (this._now() % this._windowMs);
  }

  private _roll(): void {
    const w = this._currentWindow();
    if (w !== this._windowStart) {
      this._windowStart = w;
      this._count = 0;
    }
  }
}

/**
 * Predicate gate — wraps any synchronous boolean check (penalty box
 * `!isPenalized(id)`, feature flags, circuit state) as a gate.
 * Non-refundable; pass-through on retryAfter.
 */
export class PredicateGate implements ThrottleGate {
  readonly name: string;
  private readonly _fn: () => GateResult | boolean;

  constructor(name: string, fn: () => GateResult | boolean) {
    this.name = name;
    this._fn = fn;
  }

  tryPass(): GateResult {
    const r = this._fn();
    if (typeof r === 'boolean') {
      return r ? { passed: true } : { passed: false, reason: 'predicate-false' };
    }
    return r;
  }
}
