/**
 * Wave Executor
 *
 * Executes a `WavePlan` with per-service, per-wave callbacks — the
 * runtime half the planner leaves abstract. Unlike `SwitchOrchestrator`
 * (which runs the whole cutover pipeline), the executor is just the
 * wave-loop: deploy wave → wait → next wave. Gating between waves is a
 * pluggable `WaveGate` — a health check, a soak timer, a smoke suite —
 * and its verdict can abort the rollout before dependents ship.
 *
 * Failure semantics:
 *   - A failed deploy inside a wave does NOT run later waves (the
 *     dependents-first ordering guarantee would break silently).
 *   - A failed gate halts the same way; the wave that failed reports
 *     its own status and later waves stay `pending`.
 *   - `results` always carries one entry per planned wave so callers
 *     see what *didn't* happen as clearly as what did.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { BgClock2, SystemBgClock2, WavePlan } from './types';

export type WaveStatus = 'pending' | 'deployed' | 'gate-failed' | 'deploy-failed' | 'skipped';

/** Gate verdict after a wave deploys — continue or stop. */
export type WaveGate = (waveIndex: number, services: readonly string[]) => Promise<boolean | string> | boolean | string;

/** Deploy hook per wave. */
export type WaveDeployer = (services: readonly string[]) => Promise<void> | void;

export interface WaveOutcome {
  readonly index: number;
  readonly services: readonly string[];
  readonly status: WaveStatus;
  readonly detail?: string;
  readonly startedAt: number;
  readonly endedAt: number;
}

export interface ExecutionReport {
  readonly ok: boolean;
  /** Index of the wave that halted the rollout, when halted. */
  readonly haltedAt?: number;
  readonly outcomes: readonly WaveOutcome[];
  readonly completedAt: number;
}

export class WaveExecutor {
  private readonly _clock: BgClock2;
  private readonly _plan: WavePlan;

  constructor(plan: WavePlan, clock: BgClock2 = new SystemBgClock2()) {
    this._plan = plan;
    this._clock = clock;
  }

  /**
   * Run waves in order. `gate` runs after each wave and should return
   * true/`undefined` to continue; false or a reason-string halts.
   */
  async run(deploy: WaveDeployer, gate?: WaveGate): Promise<ExecutionReport> {
    const outcomes: WaveOutcome[] = [];
    let haltedAt: number | undefined;

    for (let i = 0; i < this._plan.waves.length; i++) {
      const wave = this._plan.waves[i];
      if (wave === undefined) break;
      const startedAt = this._clock.now();
      let status: WaveStatus = 'deployed';
      let detail: string | undefined;
      try {
        await deploy(wave.services);
      } catch (err) {
        status = 'deploy-failed';
        detail = err instanceof Error ? err.message : String(err);
      }
      if (status === 'deployed' && gate) {
        try {
          const verdict = await gate(i, wave.services);
          if (verdict === false || typeof verdict === 'string') {
            status = 'gate-failed';
            detail = typeof verdict === 'string' ? verdict : 'gate returned false';
          }
        } catch (err) {
          status = 'gate-failed';
          detail = err instanceof Error ? err.message : String(err);
        }
      }
      const endedAt = this._clock.now();
      outcomes.push({ index: i, services: wave.services, status, detail, startedAt, endedAt });
      if (status !== 'deployed') {
        haltedAt = i;
        break;
      }
    }

    // Remaining waves report skipped — the outcome covers the full plan.
    for (let i = outcomes.length; i < this._plan.waves.length; i++) {
      const wave = this._plan.waves[i];
      if (wave === undefined) break;
      outcomes.push({
        index: i,
        services: wave.services,
        status: 'skipped',
        startedAt: 0,
        endedAt: 0,
      });
    }

    return {
      ok: haltedAt === undefined,
      haltedAt,
      outcomes,
      completedAt: this._clock.now(),
    };
  }
}
