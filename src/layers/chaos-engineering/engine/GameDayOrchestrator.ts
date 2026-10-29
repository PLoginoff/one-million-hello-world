/**
 * Chaos Engineering — Game-Day Orchestrator
 *
 * Coordinates a multi-scenario "game day": a curated sequence (or DAG, via
 * `dependsOn`) of chaos experiments run as one event with shared checkpoints,
 * collective abort semantics, and a scored report.
 *
 * Semantics
 * ---------
 * - Scenarios without unmet dependencies run as soon as a slot frees.
 * - `failFast: true` (default) aborts remaining scenarios on the first
 *   FAILED/ABORTED experiment; `false` continues for maximum learning.
 * - Scoring: each scenario is worth `weight` points. COMPLETED+held earns
 *   full points; COMPLETED+violated earns `partialCredit` fraction;
 *   ABORTED/FAILED/SKIPPED earn 0.
 * - The orchestrator drives engines via `tick()` using an injectable sleeper
 *   so game days are deterministic under fake clocks.
 *
 * @module ChaosEngineering/Engine
 */

import { ChaosClock, ChaosExperimentDefinition, ExperimentReport, ExperimentState } from './ChaosEngineTypes';
import { ChaosExperimentEngine } from './ChaosExperimentEngine';
import { ChaosScheduler, ScheduledExperiment } from './ChaosScheduler';

export interface GameDayScenario {
  readonly scenarioId: string;
  readonly name: string;
  readonly definition: ChaosExperimentDefinition;
  /** Scenario ids that must reach a terminal state before this may run. */
  readonly dependsOn?: ReadonlyArray<string>;
  /** Relative weight for scoring (default 1). */
  readonly weight?: number;
}

export interface GameDayPlan {
  readonly gameDayId: string;
  readonly name: string;
  readonly scenarios: ReadonlyArray<GameDayScenario>;
  /** Abort remaining scenarios on first failure (default true). */
  readonly failFast?: boolean;
  /** Fraction of weight given for COMPLETED-but-violated hypotheses (default 0.5). */
  readonly partialCredit?: number;
}

export type ScenarioStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED'
  | 'SKIPPED';

export interface ScenarioResult {
  readonly scenarioId: string;
  readonly status: ScenarioStatus;
  readonly report?: ExperimentReport;
  readonly score: number;
  readonly maxScore: number;
}

export interface GameDayReport {
  readonly gameDayId: string;
  readonly results: ReadonlyArray<ScenarioResult>;
  /** Earned points / possible points, in [0, 1]. */
  readonly scoreRatio: number;
  readonly passed: boolean;
  readonly startedAt: number;
  readonly finishedAt: number;
}

export class GameDayOrchestrator {
  private readonly _plan: GameDayPlan;
  private readonly _clock: ChaosClock;
  private readonly _scheduler: ChaosScheduler;
  private readonly _random: () => number;
  private readonly _results = new Map<string, ScenarioResult>();
  private readonly _engines = new Map<string, ChaosExperimentEngine>();
  private readonly _sleep: (ms: number) => Promise<void>;

  private _running = false;
  private _startedAt = 0;
  private _finishedAt = 0;

  constructor(
    plan: GameDayPlan,
    clock: ChaosClock = Date.now,
    random: () => number = Math.random,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    scheduler?: ChaosScheduler
  ) {
    this._plan = plan;
    this._clock = clock;
    this._random = random;
    this._sleep = sleep;
    this._scheduler = scheduler ?? new ChaosScheduler(clock, Math.max(1, plan.scenarios.length));

    for (const s of plan.scenarios) {
      this._results.set(s.scenarioId, {
        scenarioId: s.scenarioId,
        status: 'PENDING',
        score: 0,
        maxScore: s.weight ?? 1,
      });
    }
  }

  get results(): ReadonlyArray<ScenarioResult> {
    return [...this._results.values()];
  }

  get scheduler(): ChaosScheduler {
    return this._scheduler;
  }

  /** Validate the plan: unique ids, dependency closure, acyclicity (Kahn DFS). */
  validatePlan(): string[] {
    const problems: string[] = [];
    const ids = new Set<string>();
    for (const s of this._plan.scenarios) {
      if (ids.has(s.scenarioId)) problems.push(`duplicate scenario '${s.scenarioId}'`);
      ids.add(s.scenarioId);
      for (const dep of s.dependsOn ?? []) {
        if (!this._plan.scenarios.some((x) => x.scenarioId === dep)) {
          problems.push(`scenario '${s.scenarioId}' depends on unknown '${dep}'`);
        }
      }
    }
    // Cycle check via iterative DFS coloring.
    const color = new Map<string, 0 | 1 | 2>(); // 0 white,1 gray,2 black
    const visit = (id: string, stack: string[]): void => {
      const c = color.get(id) ?? 0;
      if (c === 2) return;
      if (c === 1) {
        problems.push(`dependency cycle: ${[...stack, id].join(' → ')}`);
        return;
      }
      color.set(id, 1);
      const sc = this._plan.scenarios.find((x) => x.scenarioId === id);
      for (const dep of sc?.dependsOn ?? []) {
        visit(dep, [...stack, id]);
      }
      color.set(id, 2);
    };
    for (const s of this._plan.scenarios) visit(s.scenarioId, []);
    return problems;
  }

  /**
   * Execute the game day. Scenarios whose dependencies have all completed run
   * (sequentially — deterministic and safest for shared infrastructure).
   * Respects the scheduler's safety windows: `run` blocks on `_sleep` until a
   * permitted window opens.
   */
  async run(): Promise<GameDayReport> {
    if (this._running) throw new Error('game day already running');
    this._running = true;
    this._startedAt = this._clock();
    const failFast = this._plan.failFast ?? true;
    let halted = false;

    try {
      const pending = new Set(this._plan.scenarios.map((s) => s.scenarioId));

      while (pending.size > 0 && !halted) {
        // Wait until inside a permitted window.
        const permittedAt = this._scheduler.nextPermittedAfter();
        if (permittedAt === null) {
          for (const id of pending) this._markSkipped(id, 'no permitted window remains');
          break;
        }
        const wait = permittedAt - this._clock();
        if (wait > 0) await this._sleep(wait);

        let progressed = false;
        for (const scenario of this._plan.scenarios) {
          if (!pending.has(scenario.scenarioId)) continue;
          if (!this._depsSatisfied(scenario)) continue;

          pending.delete(scenario.scenarioId);
          progressed = true;
          const result = await this._runScenario(scenario);
          if (failFast && (result.status === 'FAILED' || result.status === 'ABORTED')) {
            halted = true;
            for (const id of pending) this._markSkipped(id, 'fail-fast after ' + scenario.scenarioId);
            break;
          }
        }
        if (!progressed && pending.size > 0) {
          // All remaining scenarios are blocked — either a dependency failed
          // or a cycle slipped validation. Skip them rather than spin.
          for (const id of pending) this._markSkipped(id, 'dependencies unsatisfied');
          break;
        }
      }
    } finally {
      this._finishedAt = this._clock();
      this._running = false;
    }
    return this.report();
  }

  /** Build the aggregate report. */
  report(): GameDayReport {
    const results = this.results;
    const earned = results.reduce((a, r) => a + r.score, 0);
    const possible = results.reduce((a, r) => a + r.maxScore, 0);
    const ratio = possible > 0 ? earned / possible : 0;
    return {
      gameDayId: this._plan.gameDayId,
      results,
      scoreRatio: ratio,
      passed: ratio >= 0.999 && results.every((r) => r.status === 'COMPLETED'),
      startedAt: this._startedAt,
      finishedAt: this._finishedAt,
    };
  }

  /** Expose the engine for a scenario (for feeding metrics during a run). */
  engineFor(scenarioId: string): ChaosExperimentEngine | undefined {
    return this._engines.get(scenarioId);
  }

  // ------------------------------------------------------------------ private

  private _depsSatisfied(scenario: GameDayScenario): boolean {
    for (const dep of scenario.dependsOn ?? []) {
      const r = this._results.get(dep);
      if (!r) return false;
      if (r.status === 'PENDING' || r.status === 'RUNNING') return false;
      // A failed/aborted/skipped dependency blocks dependents (fail closed).
      if (r.status !== 'COMPLETED') return false;
    }
    return true;
  }

  private _markSkipped(scenarioId: string, reason: string): void {
    const r = this._results.get(scenarioId);
    if (!r) return;
    this._results.set(scenarioId, {
      scenarioId,
      status: 'SKIPPED',
      score: 0,
      maxScore: r.maxScore,
      report: undefined,
    });
    void reason;
  }

  private async _runScenario(scenario: GameDayScenario): Promise<ScenarioResult> {
    const current = this._results.get(scenario.scenarioId);
    if (current) {
      this._results.set(scenario.scenarioId, { ...current, status: 'RUNNING' });
    }
    const engine = new ChaosExperimentEngine(scenario.definition, this._clock, this._random);
    this._engines.set(scenario.scenarioId, engine);

    const report = await engine.run(this._sleep);
    const weight = scenario.weight ?? 1;
    let status: ScenarioStatus;
    let score = 0;
    switch (report.finalState) {
      case ExperimentState.COMPLETED:
        status = 'COMPLETED';
        score = report.hypothesisHeld
          ? weight
          : weight * (this._plan.partialCredit ?? 0.5);
        break;
      case ExperimentState.ABORTED:
        status = 'ABORTED';
        break;
      case ExperimentState.FAILED:
      default:
        status = 'FAILED';
        break;
    }
    const result: ScenarioResult = {
      scenarioId: scenario.scenarioId,
      status,
      report,
      score,
      maxScore: weight,
    };
    this._results.set(scenario.scenarioId, result);
    return result;
  }
}

/** Convenience: convert a scenario to a scheduler entry for manual scheduling. */
export function scenarioToSchedule(
  scenario: GameDayScenario,
  notBefore: number,
  opts: { notAfter?: number; recurrenceMs?: number } = {}
): ScheduledExperiment {
  return {
    scheduleId: scenario.scenarioId,
    definition: scenario.definition,
    notBefore,
    notAfter: opts.notAfter,
    recurrenceMs: opts.recurrenceMs,
  };
}
