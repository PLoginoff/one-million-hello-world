/**
 * ExperimentLifecycle — state machine governing an experiment's run.
 *
 * Experiments have a lifecycle beyond "on/off":
 *
 *   draft ──start──▶ running ──pause──▶ paused ──resume──▶ running
 *                      │                     │
 *                      └──conclude──▶ concluded ◀──conclude──┘
 *                                          │
 *                                          └──archive──▶ archived
 *
 * Rules:
 *   - Only `running` experiments accept assignments (the caller's
 *     `AbTestingEngine` checks `enabled` — this machine is the gate);
 *   - transitions are timestamped and audited;
 *   - `conclude` records the *winning variant* and a reason so post-hoc
 *     analysis knows why the experiment ended;
 *   - `archived` is terminal — no transitions out (archived experiments
 *     are historical data, not actionable config).
 *
 * The machine is deliberately separate from `AbTestingEngine` so the
 * assignment engine stays pure — lifecycle governs *whether* to ask,
 * not *how* to decide.
 *
 * @module StrategyLayer/Engine
 */

import { StrategyEngineClock, SystemEngineClock } from './types';

export type ExperimentPhase = 'draft' | 'running' | 'paused' | 'concluded' | 'archived';

export interface TransitionRecord {
  at: number;
  from: ExperimentPhase;
  to: ExperimentPhase;
  actor: string;
  reason?: string;
  /** Set when concluding: the variant judged the winner. */
  winningVariant?: string;
}

interface ExperimentState {
  id: string;
  phase: ExperimentPhase;
  winningVariant: string | null;
  history: TransitionRecord[];
}

/** Valid transitions — anything not listed throws. */
const ALLOWED: Record<ExperimentPhase, ExperimentPhase[]> = {
  draft: ['running'],
  running: ['paused', 'concluded'],
  paused: ['running', 'concluded'],
  concluded: ['archived'],
  archived: [],
};

export class InvalidTransitionError extends Error {
  constructor(id: string, from: ExperimentPhase, to: ExperimentPhase) {
    super(`Experiment "${id}" cannot go from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class ExperimentLifecycle {
  private readonly _clock: StrategyEngineClock;
  private readonly _experiments = new Map<string, ExperimentState>();

  constructor(clock: StrategyEngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  /** Register an experiment in `draft`. Idempotent. */
  register(id: string): void {
    if (this._experiments.has(id)) return;
    this._experiments.set(id, { id, phase: 'draft', winningVariant: null, history: [] });
  }

  /** Current phase (`'draft'` for unknown ids — unregistered = draft). */
  phase(id: string): ExperimentPhase {
    return this._experiments.get(id)?.phase ?? 'draft';
  }

  /** Whether the experiment currently accepts traffic. */
  isRunning(id: string): boolean {
    return this.phase(id) === 'running';
  }

  /** Generic transition with validation. */
  transition(id: string, to: ExperimentPhase, actor = 'system', reason?: string, winningVariant?: string): void {
    const s = this._mustGet(id);
    const allowed = ALLOWED[s.phase];
    if (!allowed.includes(to)) throw new InvalidTransitionError(id, s.phase, to);
    const rec: TransitionRecord = {
      at: this._clock.now(),
      from: s.phase,
      to,
      actor,
      reason,
      winningVariant,
    };
    s.history.push(rec);
    s.phase = to;
    if (winningVariant !== undefined) s.winningVariant = winningVariant;
  }

  start(id: string, actor = 'system', reason?: string): void {
    this.transition(id, 'running', actor, reason);
  }
  pause(id: string, actor = 'system', reason?: string): void {
    this.transition(id, 'paused', actor, reason);
  }
  resume(id: string, actor = 'system', reason?: string): void {
    this.transition(id, 'running', actor, reason);
  }
  conclude(id: string, winningVariant: string, actor = 'system', reason?: string): void {
    this.transition(id, 'concluded', actor, reason, winningVariant);
  }
  archive(id: string, actor = 'system', reason?: string): void {
    this.transition(id, 'archived', actor, reason);
  }

  /** Winning variant for concluded experiments. */
  winner(id: string): string | null {
    return this._experiments.get(id)?.winningVariant ?? null;
  }

  history(id: string): ReadonlyArray<TransitionRecord> {
    return this._mustGet(id).history.slice();
  }

  /** All experiments in a given phase. */
  inPhase(phase: ExperimentPhase): string[] {
    const out: string[] = [];
    for (const [id, s] of this._experiments) {
      if (s.phase === phase) out.push(id);
    }
    return out;
  }

  private _mustGet(id: string): ExperimentState {
    const s = this._experiments.get(id);
    if (!s) throw new Error(`unknown experiment "${id}"`);
    return s;
  }
}
