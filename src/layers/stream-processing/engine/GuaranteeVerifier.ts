/**
 * GuaranteeVerifier — prove a pipeline actually delivers its claimed
 * processing guarantee, instead of asserting it on faith.
 *
 * "Exactly-once" in streaming is really two properties:
 *   (a) no output produced twice for the same input record, and
 *   (b) no input record lost without an output (completeness).
 *
 * This module verifies them mechanically against the idempotency keys
 * a well-formed pipeline stamps on every output:
 *
 *   - DEDUP VERIFICATION (a): every output carries an idempotency key.
 *     A repeated key is a duplicate — for at-least-once pipelines this
 *     is the expected finding; for "exactly-once" claims it's a proof
 *     failure. Keys are tracked in a bounded ring (production
 *     idempotency windows are bounded too: Kafka dedupes within a
 *     producer-epoch window, not forever).
 *
 *   - COMPLETENESS VERIFICATION (b): inputs tagged with (sourceOffset)
 *     are tracked until their outputs arrive. `verify` reports inputs
 *     with no output — lost records — and outputs with no input —
 *     phantom/duplicated work.
 *
 *   - ORDERING: optional per-source monotonic-offset check. Outputs for
 *     a source that arrive with regressing offsets flag a
 *     partition-ordering violation (often fine for stateless ops,
 *     fatal for per-entity sessionization).
 *
 * The verifier is passive — it observes `input()`/`output()` calls and
 * never mutates the pipeline. `audit()` returns a full report; the
 * tests double as executable specifications of what each guarantee
 * level means.
 *
 * @module StreamProcessing/Engine
 */

// ---------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------

export interface VerifierInput {
  /** Source id (partition/topic shard). */
  readonly source: string;
  /** Source offset — the position the record occupies in its source. */
  readonly offset: number;
  /** Idempotency key the pipeline should stamp on derived outputs. */
  readonly dedupKey: string;
  readonly timestamp: number;
}

export interface VerifierOutput {
  /** The input's dedupKey this output claims to derive from. */
  readonly dedupKey: string;
  readonly timestamp: number;
}

export type ViolationKind =
  | 'duplicate'        // same dedupKey produced output twice
  | 'lost'             // input consumed, no output within the window
  | 'phantom'          // output for a dedupKey never seen as input
  | 'order-regression' // per-source output offsets went backwards
  ;

export interface GuaranteeViolation {
  readonly kind: ViolationKind;
  readonly dedupKey: string;
  readonly detail: string;
  readonly timestamp: number;
}

export interface GuaranteeReport {
  readonly inputs: number;
  readonly outputs: number;
  readonly duplicates: number;
  readonly lost: number;
  readonly phantoms: number;
  readonly orderRegressions: number;
  /** True when exactly-once semantics hold for the observed window. */
  readonly exactlyOnce: boolean;
  /** True when every input produced >= 1 output (at-least-once floor). */
  readonly atLeastOnce: boolean;
  readonly violations: GuaranteeViolation[];
}

// ---------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------

/**
 * Bounded observation window: dedup keys and pending inputs are kept in
 * insertion-ordered maps — a real pipeline can't dedupe "all of history"
 * either, so the verifier mirrors the same bounded window.
 */
export class GuaranteeVerifier {
  private readonly _window: number;
  /** dedupKey -> first output timestamp (insertion-ordered). */
  private readonly _seen = new Map<string, number>();
  /** Every dedupKey ever input (bounded) — the phantom reference set. */
  private readonly _inputKeys = new Set<string>();
  /** dedupKey -> input (awaiting output). */
  private readonly _pending = new Map<string, VerifierInput>();
  /** source -> highest output offset observed (ordering check). */
  private readonly _lastOffset = new Map<string, number>();
  private readonly _violations: GuaranteeViolation[] = [];
  private _inputs = 0;
  private _outputs = 0;
  private _duplicates = 0;
  private _phantoms = 0;
  private _orderRegressions = 0;

  constructor(options: { windowSize?: number } = {}) {
    this._window = Math.max(8, options.windowSize ?? 10_000);
  }

  /**
   * Register an input record entering the pipeline. The dedupKey the
   * pipeline should stamp on its output is declared up front — output()
   * then proves the same key appeared exactly once.
   */
  input(rec: VerifierInput): void {
    this._inputs++;
    this._inputKeys.add(rec.dedupKey);
    this._pending.set(rec.dedupKey, rec);
    this._trim(this._pending);
    this._trimSet(this._inputKeys);
    // Per-source ordering on INPUT order is informational only; the
    // regression check runs on outputs (the pipeline's visible order).
  }

  /**
   * Register an output the pipeline emitted, tagged with the dedupKey
   * it claims descent from.
   */
  output(out: VerifierOutput): void {
    this._outputs++;
    if (this._seen.has(out.dedupKey)) {
      this._duplicates++;
      this._violations.push({
        kind: 'duplicate',
        dedupKey: out.dedupKey,
        detail: `dedupKey '${out.dedupKey}' produced a second output`,
        timestamp: out.timestamp,
      });
    } else {
      this._seen.set(out.dedupKey, out.timestamp);
      this._trim(this._seen);
    }
    if (!this._pending.delete(out.dedupKey) && !this._inputKeys.has(out.dedupKey)) {
      // Output for a key that was never an input — phantom work.
      this._phantoms++;
      this._violations.push({
        kind: 'phantom',
        dedupKey: out.dedupKey,
        detail: `output claims dedupKey '${out.dedupKey}' never observed as input`,
        timestamp: out.timestamp,
      });
    }
  }

  /**
   * Ordering check: a pipeline that promises per-source order should
   * emit outputs in non-decreasing source offset. `observeOutputOffset`
   * is called by the harness for each output's source offset.
   */
  observeOutputOffset(source: string, offset: number, timestamp: number): void {
    const last = this._lastOffset.get(source);
    if (last !== undefined && offset < last) {
      this._orderRegressions++;
      this._violations.push({
        kind: 'order-regression',
        dedupKey: `${source}@${offset}`,
        detail: `source '${source}' emitted offset ${offset} after ${last}`,
        timestamp,
      });
    }
    if (last === undefined || offset > last) this._lastOffset.set(source, offset);
  }

  /** FIFO trim of a bounded map — drop the oldest entries over the cap. */
  private _trim(m: Map<string, unknown>): void {
    while (m.size > this._window) {
      const first = m.keys().next();
      if (first.done) break;
      m.delete(first.value);
    }
  }

  private _trimSet(s: Set<string>): void {
    while (s.size > this._window) {
      const first = s.values().next();
      if (first.done) break;
      s.delete(first.value);
    }
  }

  /**
   * Audit: pending inputs with no output are "lost" (the completeness
   * side of exactly-once). Call after the pipeline drains — pending
   * entries during a live run are just in-flight.
   */
  audit(): GuaranteeReport {
    const violations = [...this._violations];
    for (const [key, rec] of this._pending) {
      violations.push({
        kind: 'lost',
        dedupKey: key,
        detail: `input '${key}' (offset ${rec.offset} on '${rec.source}') produced no output`,
        timestamp: rec.timestamp,
      });
    }
    const lost = this._pending.size;
    const dups = this._duplicates;
    const phantoms = this._phantoms;
    return {
      inputs: this._inputs,
      outputs: this._outputs,
      duplicates: dups,
      lost,
      phantoms,
      orderRegressions: this._orderRegressions,
      // exactly-once = no dupes, no loss, no phantom work.
      exactlyOnce: dups === 0 && lost === 0 && phantoms === 0,
      // at-least-once = no loss (dupes allowed).
      atLeastOnce: lost === 0,
      violations,
    };
  }

  /** True if any duplicates have been observed so far (live check). */
  get hasDuplicates(): boolean {
    return this._duplicates > 0;
  }

  /** Inputs still awaiting their output (in-flight count). */
  get inFlight(): number {
    return this._pending.size;
  }

  get inputCount(): number {
    return this._inputs;
  }

  get outputCount(): number {
    return this._outputs;
  }
}

// ---------------------------------------------------------------------
// Idempotent dedup gate — the enforcement twin of the verifier
// ---------------------------------------------------------------------

/**
 * DedupGate — the write-side mechanism the verifier checks.
 *
 * A bounded idempotency filter: `check(key)` returns true the first
 * time, false on repeats — the standard dedupe-before-side-effect
 * pattern (Flink's TwoPhaseCommit idempotent committer, Kafka's
 * producer idempotence window).
 *
 * Bounded like the verifier: keys are kept in insertion order and the
 * oldest are evicted past `capacity`, mirroring real bounded dedup
 * windows.
 */
export class DedupGate {
  private readonly _seen = new Set<string>();
  private readonly _capacity: number;
  private _admitted = 0;
  private _rejected = 0;

  constructor(capacity = 10_000) {
    this._capacity = Math.max(8, capacity);
  }

  /** True on first sight (admit), false on repeat (suppress). */
  check(dedupKey: string): boolean {
    if (this._seen.has(dedupKey)) {
      this._rejected++;
      return false;
    }
    this._seen.add(dedupKey);
    this._admitted++;
    if (this._seen.size > this._capacity) {
      const first = this._seen.values().next();
      if (!first.done) this._seen.delete(first.value);
    }
    return true;
  }

  has(dedupKey: string): boolean {
    return this._seen.has(dedupKey);
  }

  get admitted(): number {
    return this._admitted;
  }

  get rejected(): number {
    return this._rejected;
  }

  get size(): number {
    return this._seen.size;
  }
}
