/**
 * Switch Orchestrator
 *
 * The conductor that turns the engine2 pieces into a cutover pipeline:
 *
 *   parity check → deploy green (per wave) → smoke tests →
 *   traffic analysis → commit | rollback
 *
 * At each gate the orchestrator records evidence and can halt: parity
 * issues stop the deploy (no point shipping into a misconfigured
 * stack); a failed smoke check stops before traffic touches green;
 * traffic analysis that marks green worse triggers `InstantRollback`
 * with every captured snapshot restored in reverse wave order.
 *
 * The environment is a thin interface (deployWave, checkParity data,
 * traffic windows) so the same orchestration runs against a real
 * control plane or a test stub.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import {
  BgClock2,
  EnvVarEntry,
  ParityReport,
  ServiceStateSnapshot,
  SmokeReport,
  SmokeTest,
  SystemBgClock2,
  TrafficComparison,
  TrafficWindow,
  WavePlan,
} from './types';
import { checkParity } from './ParityChecker';
import { SmokeRunner } from './SmokeRunner';
import { compareWindows, TrafficPolicy } from './TrafficAnalysis';
import { InstantRollback } from './InstantRollback';

/** What the orchestrator asks of the deploy environment. */
export interface SwitchEnvironment {
  /** Current env config on each side (for parity). */
  blueEnv(): Promise<readonly EnvVarEntry[]> | readonly EnvVarEntry[];
  greenEnv(): Promise<readonly EnvVarEntry[]> | readonly EnvVarEntry[];
  /** Deploy one wave's services to green. */
  deployWave(services: readonly string[]): Promise<void> | void;
  /** Sample the traffic windows for comparison. */
  traffic(): Promise<{ blue: TrafficWindow; green: TrafficWindow }> | { blue: TrafficWindow; green: TrafficWindow };
  /** Restore a service's captured pre-switch state (rollback). */
  restore(service: string, state: unknown): Promise<void> | void;
  /** Pre-switch state a service should snapshot before its wave deploys. */
  capture(service: string): Promise<unknown> | unknown;
}

export type SwitchGate = 'parity' | 'deploy' | 'smoke' | 'traffic' | 'committed' | 'rolledback';

export interface SwitchOutcome {
  readonly gate: SwitchGate;
  readonly ok: boolean;
  readonly parity?: ParityReport;
  readonly smoke?: SmokeReport;
  readonly traffic?: TrafficComparison;
  readonly rollback?: { ok: boolean; manual: readonly string[] };
  readonly log: readonly string[];
}

export interface SwitchOptions {
  readonly smokeTests?: readonly SmokeTest[];
  readonly ignoreParityKeys?: readonly string[];
  readonly trafficPolicy?: Partial<TrafficPolicy>;
}

export class SwitchOrchestrator {
  private readonly _clock: BgClock2;
  private readonly _env: SwitchEnvironment;
  private readonly _plan: WavePlan;
  private readonly _rollback: InstantRollback;
  private readonly _log: string[] = [];

  constructor(
    env: SwitchEnvironment,
    plan: WavePlan,
    clock: BgClock2 = new SystemBgClock2()
  ) {
    this._env = env;
    this._plan = plan;
    this._clock = clock;
    this._rollback = new InstantRollback(plan, clock);
  }

  /**
   * Run the cutover pipeline; halts at the first failed gate and rolls
   * back if the failure came after traffic could have touched green.
   */
  async run(options: SwitchOptions = {}): Promise<SwitchOutcome> {
    const log = this._log;

    // Gate 1: parity — refuse to deploy into a misconfigured stack.
    const [blue, green] = await Promise.all([
      Promise.resolve(this._env.blueEnv()),
      Promise.resolve(this._env.greenEnv()),
    ]);
    const parity = checkParity(blue, green, options.ignoreParityKeys);
    log.push(`parity: ${parity.issues.length} issue(s) over ${parity.comparedKeys} keys`);
    if (!parity.ok) {
      return this._outcome('parity', false, { parity });
    }

    // Gate 2: deploy waves, capturing state per service for rollback.
    const snapshots: ServiceStateSnapshot[] = [];
    for (const wave of this._plan.waves) {
      for (const svc of wave.services) {
        const state = await Promise.resolve(this._env.capture(svc));
        snapshots.push(this._rollback.capture(svc, state));
      }
      await Promise.resolve(this._env.deployWave(wave.services));
      log.push(`deployed wave: ${wave.services.join(', ')}`);
    }

    // Gate 3: smoke tests on green.
    const smoke = await new SmokeRunner(options.smokeTests ?? [], this._clock).run();
    log.push(`smoke: ${smoke.results.filter((r) => r.ok).length}/${smoke.results.length} passed`);
    if (!smoke.ok) {
      const rollback = await this._rollback.rollback(this._env.restore);
      return this._outcome('smoke', false, {
        parity, smoke,
        rollback: { ok: rollback.ok, manual: rollback.manual },
      });
    }

    // Gate 4: traffic analysis — the data-driven go/rollback call.
    const tw = await Promise.resolve(this._env.traffic());
    const traffic = compareWindows(tw.blue, tw.green, options.trafficPolicy);
    log.push(`traffic: ${traffic.reason}`);
    if (traffic.greenWorse) {
      const rollback = await this._rollback.rollback(this._env.restore);
      return this._outcome('rolledback', false, {
        parity, smoke, traffic,
        rollback: { ok: rollback.ok, manual: rollback.manual },
      });
    }

    return this._outcome('committed', true, { parity, smoke, traffic });
  }

  private _outcome(
    gate: SwitchGate,
    ok: boolean,
    extra: Omit<SwitchOutcome, 'gate' | 'ok' | 'log'>
  ): SwitchOutcome {
    return { gate, ok, ...extra, log: [...this._log] };
  }
}
