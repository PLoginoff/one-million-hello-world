/**
 * Chaos Engineering — Fault Injector
 *
 * Runtime fault-injection boundary. Active faults are kept in an insertion-ordered
 * map keyed by fault id; for every {@link InjectionTarget} each fault is evaluated
 * in order and produces a {@link FaultDecision} audit record.
 *
 * Injection algorithm
 * -------------------
 * 1. Scope check: the target must fall inside the blast radius (percentage +
 *    optional explicit id set + optional attribute filter + hard target cap).
 * 2. Draw check: `random() < probability` decides whether this particular
 *    request suffers the fault (per-request Bernoulli sampling, O(1)).
 * 3. Effect materialization: latency returns a millisecond penalty (uniform
 *    jitter inside [min, max]); error synthesizes a `ChaosFaultError`;
 *    packet-loss returns a drop/duplicate verdict; abort halts the engine.
 *
 * Complexity: evaluating a request is O(F) in the number of active faults;
 * arm/disarm are O(1) via the backing Map.
 *
 * @module ChaosEngineering/Engine
 */

import {
  BlastRadiusScope,
  ChaosClock,
  ChaosRandomSource,
  FaultDecision,
  FaultDescriptor,
  FaultKind,
  InjectionTarget,
} from './ChaosEngineTypes';

/** Synthesized error thrown for ERROR faults. */
export class ChaosFaultError extends Error {
  readonly faultId: string;
  readonly code: string;
  constructor(faultId: string, code: string, message: string) {
    super(message);
    this.name = 'ChaosFaultError';
    this.faultId = faultId;
    this.code = code;
  }
}

/** Result of applying all armed faults to one target. */
export interface InjectionOutcome {
  readonly decisions: ReadonlyArray<FaultDecision>;
  /** Total artificial latency the caller should wait before proceeding (ms). */
  readonly totalLatencyMs: number;
  /** Set when an ERROR fault fired — caller should surface it to the request. */
  readonly error?: ChaosFaultError;
  /** Packet-loss verdict: true when the request should be dropped. */
  readonly dropPacket: boolean;
  /** Packet-loss verdict: true when the request should be duplicated. */
  readonly duplicatePacket: boolean;
  /** An ABORT fault fired — the owning experiment must abort immediately. */
  readonly abortRequested: boolean;
  readonly abortReason?: string;
}

/** Internal bookkeeping for an armed fault. */
interface ArmedFault {
  readonly descriptor: FaultDescriptor;
  readonly armedAt: number;
  /** Distinct targets currently observed in scope (enforces maxAffectedTargets). */
  readonly scopedTargets: Set<string>;
  /** Running count of fires — powers observability without another pass. */
  fireCount: number;
  evaluateCount: number;
}

export class FaultInjector {
  private readonly _faults: Map<string, ArmedFault> = new Map();
  private readonly _scope: BlastRadiusScope;
  private readonly _clock: ChaosClock;
  private readonly _random: ChaosRandomSource;
  private readonly _decisionLog: FaultDecision[] = [];
  private readonly _maxDecisionLog: number;

  constructor(
    scope: BlastRadiusScope,
    clock: ChaosClock = Date.now,
    random: ChaosRandomSource = Math.random,
    maxDecisionLog = 100_000
  ) {
    if (!(scope.percentage > 0 && scope.percentage <= 1)) {
      throw new RangeError(`blast radius percentage must be in (0,1], got ${scope.percentage}`);
    }
    this._scope = scope;
    this._clock = clock;
    this._random = random;
    this._maxDecisionLog = maxDecisionLog;
  }

  /** Number of currently armed faults. */
  get armedCount(): number {
    return this._faults.size;
  }

  /** Arm a fault. Re-arming the same id replaces the descriptor (idempotent). */
  arm(fault: FaultDescriptor): void {
    this._validate(fault);
    this._faults.set(fault.id, {
      descriptor: fault,
      armedAt: this._clock(),
      scopedTargets: new Set<string>(),
      fireCount: 0,
      evaluateCount: 0,
    });
  }

  /** Disarm a fault. Returns false when the id was not armed. */
  disarm(faultId: string): boolean {
    return this._faults.delete(faultId);
  }

  /** Disarm every fault — called on experiment abort/rollback. O(F). */
  disarmAll(): number {
    const n = this._faults.size;
    this._faults.clear();
    return n;
  }

  /** Whether a fault id is currently armed. */
  isArmed(faultId: string): boolean {
    return this._faults.has(faultId);
  }

  /** Audit trail of every decision made (ring-bounded by maxDecisionLog). */
  get decisionLog(): ReadonlyArray<FaultDecision> {
    return this._decisionLog;
  }

  /** Aggregate counters per fault id. */
  stats(): ReadonlyArray<{ faultId: string; evaluated: number; fired: number }> {
    const out: Array<{ faultId: string; evaluated: number; fired: number }> = [];
    for (const armed of this._faults.values()) {
      out.push({
        faultId: armed.descriptor.id,
        evaluated: armed.evaluateCount,
        fired: armed.fireCount,
      });
    }
    return out;
  }

  /**
   * Evaluate every armed fault against a target. Returns the aggregate outcome
   * plus the per-fault audit decisions.
   */
  evaluate(target: InjectionTarget): InjectionOutcome {
    const decisions: FaultDecision[] = [];
    let totalLatencyMs = 0;
    let error: ChaosFaultError | undefined;
    let dropPacket = false;
    let duplicatePacket = false;
    let abortRequested = false;
    let abortReason: string | undefined;

    for (const armed of this._faults.values()) {
      armed.evaluateCount++;
      const inScope = this._inScope(armed, target);
      const d = armed.descriptor;

      if (!inScope) {
        decisions.push(this._decision(d, target, false, false, 0, 'out-of-scope'));
        continue;
      }

      const fired = this._random() < d.probability;
      if (!fired) {
        decisions.push(this._decision(d, target, true, false, 0, 'draw-miss'));
        continue;
      }

      armed.fireCount++;
      switch (d.kind) {
        case FaultKind.LATENCY: {
          const ms = this._latencyAmount(d);
          totalLatencyMs += ms;
          decisions.push(this._decision(d, target, true, true, ms, `+${ms}ms latency`));
          break;
        }
        case FaultKind.ERROR: {
          error = new ChaosFaultError(
            d.id,
            d.errorCode ?? 'CHAOS_ERROR',
            d.errorMessage ?? 'Injected chaos error'
          );
          decisions.push(this._decision(d, target, true, true, 0, `error ${error.code}`));
          break;
        }
        case FaultKind.PACKET_LOSS: {
          const drop = this._random() < (d.dropRate ?? 0);
          const dup = !drop && this._random() < (d.duplicateRate ?? 0);
          dropPacket = dropPacket || drop;
          duplicatePacket = duplicatePacket || dup;
          decisions.push(
            this._decision(d, target, true, true, 0, drop ? 'drop' : dup ? 'duplicate' : 'pass')
          );
          break;
        }
        case FaultKind.RESOURCE: {
          decisions.push(
            this._decision(
              d,
              target,
              true,
              true,
              0,
              `resource burn=${d.burnMs ?? 0}ms churn=${d.churnBytes ?? 0}B`
            )
          );
          break;
        }
        case FaultKind.ABORT: {
          abortRequested = true;
          abortReason = d.abortReason ?? `abort fault ${d.id} fired`;
          decisions.push(this._decision(d, target, true, true, 0, `abort: ${abortReason}`));
          break;
        }
      }
    }

    return {
      decisions,
      totalLatencyMs,
      error,
      dropPacket,
      duplicatePacket,
      abortRequested,
      abortReason,
    };
  }

  /**
   * Convenience wrapper: evaluate the target, sleep for the injected latency
   * (via the injectable sleeper), then throw the synthesized error if any.
   * Returns the outcome for callers that survived.
   */
  async apply(
    target: InjectionTarget,
    sleeper: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ): Promise<InjectionOutcome> {
    const outcome = this.evaluate(target);
    if (outcome.totalLatencyMs > 0) {
      await sleeper(outcome.totalLatencyMs);
    }
    if (outcome.error) {
      throw outcome.error;
    }
    return outcome;
  }

  // ------------------------------------------------------------------ private

  /** Scope check: percentage draw + explicit ids + attribute filter + target cap. */
  private _inScope(armed: ArmedFault, target: InjectionTarget): boolean {
    const s = this._scope;

    if (s.targetIds && s.targetIds.size > 0 && !s.targetIds.has(target.targetId)) {
      return false;
    }
    if (s.targetFilter && !s.targetFilter(target.attributes)) {
      return false;
    }

    // Percentage gate: target already committed to this fault stays in scope so
    // the same target receives consistent treatment across the experiment.
    if (armed.scopedTargets.has(target.targetId)) {
      return true;
    }
    if (s.maxAffectedTargets !== undefined && armed.scopedTargets.size >= s.maxAffectedTargets) {
      return false;
    }
    if (s.percentage < 1 && this._random() >= s.percentage) {
      return false;
    }
    armed.scopedTargets.add(target.targetId);
    return true;
  }

  /** Materialize a latency amount — fixed ms or uniform jitter in [min, max]. */
  private _latencyAmount(d: FaultDescriptor): number {
    const spec = d.latencyMs ?? 0;
    if (typeof spec === 'number') {
      return Math.max(0, spec);
    }
    const [min, max] = spec;
    const lo = Math.max(0, Math.min(min, max));
    const hi = Math.max(min, max);
    return lo + this._random() * (hi - lo);
  }

  private _decision(
    d: FaultDescriptor,
    target: InjectionTarget,
    inScope: boolean,
    fired: boolean,
    latencyAddedMs: number,
    detail: string
  ): FaultDecision {
    const decision: FaultDecision = {
      faultId: d.id,
      kind: d.kind,
      fired,
      inScope,
      targetId: target.targetId,
      latencyAddedMs,
      detail,
      decidedAt: this._clock(),
    };
    this._decisionLog.push(decision);
    if (this._decisionLog.length > this._maxDecisionLog) {
      // Ring-buffer behavior: drop oldest quarter to amortize splice cost.
      this._decisionLog.splice(0, Math.floor(this._maxDecisionLog / 4));
    }
    return decision;
  }

  private _validate(f: FaultDescriptor): void {
    if (!f.id) {
      throw new TypeError('fault id is required');
    }
    if (!(f.probability >= 0 && f.probability <= 1)) {
      throw new RangeError(`fault ${f.id}: probability must be in [0,1], got ${f.probability}`);
    }
    if (f.dropRate !== undefined && !(f.dropRate >= 0 && f.dropRate <= 1)) {
      throw new RangeError(`fault ${f.id}: dropRate must be in [0,1]`);
    }
    if (f.duplicateRate !== undefined && !(f.duplicateRate >= 0 && f.duplicateRate <= 1)) {
      throw new RangeError(`fault ${f.id}: duplicateRate must be in [0,1]`);
    }
  }
}
