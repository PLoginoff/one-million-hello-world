/**
 * Canary Deploy — Promotion Gates
 *
 * A canary may only be promoted to 100% when EVERY configured gate is
 * satisfied. Two gate kinds:
 *
 *  - 'automated' — a predicate over the trailing verdict history
 *    (e.g. "last 3 windows all healthy"). Evaluated on each new verdict.
 *  - 'manual' — requires explicit `approve(gate, actor)`; models the
 *    human sign-off step in regulated delivery pipelines.
 *
 * Approval tokens are one-shot: approving a manual gate stamps it with
 * the actor + timestamp, and `revoke()` clears it (e.g. new analysis
 * invalidates an old approval when the operator wants a fresh look —
 * see `resetOnVerdict` option).
 *
 * The controller is deliberately decoupled from the rollout state machine:
 * it answers "may we promote?" — the caller performs the promotion.
 *
 * @module CanaryDeploy/Engine2
 */

import {
  CombinedVerdict,
  Engine2Clock,
  GateState,
  PromotionGate,
} from './CanaryEngine2Types';

export class PromotionGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromotionGateError';
  }
}

export class PromotionGateController {
  private readonly _gates: ReadonlyArray<PromotionGate>;
  private readonly _clock: Engine2Clock;
  /** gate name → approval record for manual gates. */
  private readonly _approvals = new Map<string, { by: string; at: number }>();
  private readonly _history: CombinedVerdict[] = [];
  private readonly _maxHistory: number;
  /** When true, a new UNHEALTHY verdict revokes manual approvals. */
  private readonly _revokeOnUnhealthy: boolean;

  constructor(
    gates: ReadonlyArray<PromotionGate>,
    options: { clock?: Engine2Clock; maxHistory?: number; revokeOnUnhealthy?: boolean } = {}
  ) {
    if (gates.length === 0) throw new Error('at least one promotion gate required');
    const names = new Set<string>();
    for (const g of gates) {
      if (names.has(g.name)) throw new Error(`duplicate gate '${g.name}'`);
      names.add(g.name);
      if (g.kind === 'automated' && !g.predicate) {
        throw new PromotionGateError(`automated gate '${g.name}' requires a predicate`);
      }
      if (g.kind === 'manual' && g.predicate) {
        throw new PromotionGateError(`manual gate '${g.name}' must not have a predicate`);
      }
    }
    this._gates = gates;
    this._clock = options.clock ?? Date.now;
    this._maxHistory = options.maxHistory ?? 500;
    this._revokeOnUnhealthy = options.revokeOnUnhealthy ?? true;
  }

  /** Record a verdict — re-evaluates automated gates, maybe revokes approvals. */
  record(verdict: CombinedVerdict): void {
    this._history.push(verdict);
    if (this._history.length > this._maxHistory) {
      this._history.splice(0, this._history.length - this._maxHistory);
    }
    if (this._revokeOnUnhealthy && verdict.status === 'unhealthy') {
      this._approvals.clear();
    }
  }

  /** Approve a manual gate. Idempotent — re-approval updates the stamp. */
  approve(gateName: string, approvedBy: string): GateState {
    const gate = this._gates.find((g) => g.name === gateName);
    if (!gate) throw new PromotionGateError(`unknown gate '${gateName}'`);
    if (gate.kind !== 'manual') {
      throw new PromotionGateError(`gate '${gateName}' is automated — cannot approve manually`);
    }
    this._approvals.set(gateName, { by: approvedBy, at: this._clock() });
    return this._gateState(gate);
  }

  /** Revoke a manual approval (e.g. operator changed their mind). */
  revoke(gateName: string): void {
    this._approvals.delete(gateName);
  }

  /** State of every gate, in declaration order. */
  gateStates(): GateState[] {
    return this._gates.map((g) => this._gateState(g));
  }

  /** Gates still blocking promotion. */
  pendingGates(): ReadonlyArray<GateState> {
    return this.gateStates().filter((s) => !s.satisfied);
  }

  /** May the canary be promoted? True only when ALL gates are satisfied. */
  canPromote(): boolean {
    return this.pendingGates().length === 0;
  }

  /** Human-readable summary of what blocks promotion. */
  blockingReason(): string {
    const pending = this.pendingGates();
    if (pending.length === 0) return 'all gates satisfied';
    return pending.map((p) => `${p.gate}: ${p.reason}`).join('; ');
  }

  /** Reset approvals + history (new rollout). */
  reset(): void {
    this._approvals.clear();
    this._history.length = 0;
  }

  private _gateState(gate: PromotionGate): GateState {
    if (gate.kind === 'manual') {
      const approval = this._approvals.get(gate.name);
      return approval
        ? {
            gate: gate.name,
            kind: gate.kind,
            satisfied: true,
            approvedBy: approval.by,
            approvedAt: approval.at,
            reason: `approved by ${approval.by}`,
          }
        : {
            gate: gate.name,
            kind: gate.kind,
            satisfied: false,
            reason: 'awaiting manual approval',
          };
    }
    const windowCount = gate.windowCount ?? this._history.length;
    const slice = this._history.slice(-Math.max(1, windowCount));
    if (slice.length === 0) {
      return { gate: gate.name, kind: gate.kind, satisfied: false, reason: 'no verdicts recorded' };
    }
    const failure = gate.predicate!(slice);
    return failure === null
      ? { gate: gate.name, kind: gate.kind, satisfied: true, reason: 'predicate satisfied' }
      : { gate: gate.name, kind: gate.kind, satisfied: false, reason: failure };
  }
}

/* ------------------------------------------------------------------ */
/* Built-in automated gate predicates                                   */
/* ------------------------------------------------------------------ */

export const promotionGates = {
  /**
   * Automated: the last `windowCount` verdicts must all be 'healthy'.
   */
  allHealthy(windowCount: number): PromotionGate {
    return {
      name: `all-healthy-${windowCount}`,
      kind: 'automated',
      windowCount,
      predicate: (history) => {
        if (history.length < windowCount) {
          return `only ${history.length}/${windowCount} verdicts recorded`;
        }
        const bad = history.filter((v) => v.status !== 'healthy');
        return bad.length === 0
          ? null
          : `${bad.length}/${history.length} recent verdicts not healthy`;
      },
    };
  },

  /**
   * Automated: mean combined score over the last `windowCount` verdicts
   * must be ≥ `minScore`.
   */
  minAverageScore(minScore: number, windowCount: number): PromotionGate {
    return {
      name: `avg-score-${minScore}`,
      kind: 'automated',
      windowCount,
      predicate: (history) => {
        if (history.length < windowCount) {
          return `only ${history.length}/${windowCount} verdicts recorded`;
        }
        const mean = history.reduce((a, v) => a + v.score, 0) / history.length;
        return mean >= minScore ? null : `mean score ${mean.toFixed(3)} < ${minScore}`;
      },
    };
  },

  /**
   * Automated: no verdict in the last `windowCount` may list `metric`
   * among its failing metrics — per-metric soak requirement.
   */
  metricStable(metric: string, windowCount: number): PromotionGate {
    return {
      name: `metric-stable:${metric}`,
      kind: 'automated',
      windowCount,
      predicate: (history) => {
        if (history.length < windowCount) {
          return `only ${history.length}/${windowCount} verdicts recorded`;
        }
        const bad = history.filter((v) => v.failingMetrics.includes(metric));
        return bad.length === 0
          ? null
          : `${metric} failed in ${bad.length}/${history.length} recent windows`;
      },
    };
  },

  /** Manual sign-off gate. */
  manualSignoff(name: string): PromotionGate {
    return { name, kind: 'manual' };
  },
};
