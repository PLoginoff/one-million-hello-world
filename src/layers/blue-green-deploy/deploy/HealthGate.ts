/**
 * Blue-Green Deploy — Health Gate
 *
 * Composite gate: every registered probe must report a score ≥ its minimum
 * for the gate to open. Probes are evaluated sequentially (deterministic,
 * and a slow/hung probe can't starve later ones in a way parallel eval hides).
 * A throwing probe counts as score 0 — fail closed.
 *
 * The gate also computes the aggregate health as the minimum probe score
 * (weakest-link semantics), which the orchestrator reports per environment.
 *
 * @module BlueGreenDeploy/Deploy
 */

import { BgClock, EnvColor, HealthProbe } from './BlueGreenTypes';

export interface GateVerdict {
  readonly open: boolean;
  /** Weakest-link aggregate score. */
  readonly aggregateScore: number;
  readonly probeScores: ReadonlyArray<{ name: string; score: number; passed: boolean; error?: string }>;
}

export class HealthGate {
  private readonly _clock: BgClock;
  private readonly _probes: HealthProbe[] = [];

  constructor(clock: BgClock = Date.now) {
    this._clock = clock;
  }

  addProbe(probe: HealthProbe): void {
    if (this._probes.some((p) => p.name === probe.name)) {
      throw new Error(`probe '${probe.name}' already registered`);
    }
    this._probes.push(probe);
  }

  removeProbe(name: string): boolean {
    const i = this._probes.findIndex((p) => p.name === name);
    if (i < 0) return false;
    this._probes.splice(i, 1);
    return true;
  }

  get probeNames(): ReadonlyArray<string> {
    return this._probes.map((p) => p.name);
  }

  /** Evaluate all probes against an environment/version. */
  async evaluate(env: EnvColor, version: string): Promise<GateVerdict> {
    const scores: Array<{ name: string; score: number; passed: boolean; error?: string }> = [];
    let open = true;
    let aggregate = 1;

    for (const probe of this._probes) {
      let score = 0;
      let error: string | undefined;
      try {
        score = await probe.check(env, version);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        score = 0;
      }
      const min = probe.minScore ?? 0.5;
      const passed = score >= min && error === undefined;
      if (!passed) open = false;
      aggregate = Math.min(aggregate, score);
      scores.push({ name: probe.name, score, passed, error });
    }

    // No probes → gate vacuously open.
    if (this._probes.length === 0) aggregate = 1;

    void this._clock;
    return { open, aggregateScore: aggregate, probeScores: scores };
  }
}
