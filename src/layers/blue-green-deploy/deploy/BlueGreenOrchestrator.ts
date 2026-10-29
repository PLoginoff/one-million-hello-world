/**
 * Blue-Green Deploy — Deployment Orchestrator
 *
 * Drives a version release through the deployment state machine:
 *
 *   IDLE → PROVISIONING → SMOKE_TESTING → HEALTH_GATING → SHIFTING
 *     → DRAINING → COMPLETE
 *              (any failure path) → FAILED | ROLLING_BACK → ROLLED_BACK
 *
 * Flow
 * ----
 * 1. Provision the new version into the idle slot (blue↔green alternate).
 * 2. Run smoke tests; a required-test failure → FAILED (no traffic touched).
 * 3. Evaluate the health gate; closed gate → FAILED.
 * 4. Shift traffic: instant cutover or a gradual step plan. During a gradual
 *    shift the rollback monitor is evaluated at each dwell — a tripped
 *    trigger walks back to the pre-shift split and marks ROLLED_BACK.
 * 5. Drain the old live environment (bounded wait + force-close), retire it.
 *
 * All sleeps go through an injectable `sleeper`; all timing through an
 * injectable clock — fully deterministic under test.
 *
 * @module BlueGreenDeploy/Deploy
 */

import {
  BgClock,
  DeploymentRecord,
  DeploymentState,
  DEPLOYMENT_TRANSITIONS,
  EnvColor,
  EnvState,
  HealthProbe,
  RollbackTrigger,
  SmokeTest,
  SmokeTestResult,
  TrafficStep,
} from './BlueGreenTypes';
import { EnvironmentManager, InvalidEnvTransition } from './EnvironmentManager';
import { HealthGate } from './HealthGate';
import { RequestDrainer, DrainResult } from './RequestDrainer';
import { RollbackMonitor } from './RollbackMonitor';
import { TrafficSwitcher } from './TrafficSwitcher';

export class InvalidDeploymentTransition extends Error {
  constructor(from: DeploymentState, to: DeploymentState) {
    super(`invalid deployment transition ${from} → ${to}`);
    this.name = 'InvalidDeploymentTransition';
  }
}

/** Sentinel thrown inside the shift loop to signal monitor-triggered rollback. */
const ROLLBACK_SENTINEL = '__bg_rollback__';

export interface BlueGreenConfig {
  /** Smoke tests run before the target env goes live. */
  readonly smokeTests?: ReadonlyArray<SmokeTest>;
  /** Health probes gated on before + during the shift. */
  readonly healthProbes?: ReadonlyArray<HealthProbe>;
  /** Automatic rollback trigger; when absent no auto-rollback. */
  readonly rollbackTrigger?: RollbackTrigger;
  /** Max ms to wait for in-flight drain before force-closing. */
  readonly drainTimeoutMs?: number;
  /** Poll interval for drain (default 50ms). */
  readonly drainPollMs?: number;
}

export class BlueGreenOrchestrator {
  private readonly _clock: BgClock;
  private readonly _sleeper: (ms: number) => Promise<void>;
  private readonly _envs: EnvironmentManager;
  private readonly _switcher: TrafficSwitcher;
  private readonly _gate: HealthGate;
  private readonly _drainer: RequestDrainer;
  private readonly _config: BlueGreenConfig;

  private _state: DeploymentState = DeploymentState.IDLE;
  private _transitions: Array<{ from: DeploymentState; to: DeploymentState; at: number; reason: string }> = [];
  private _smokeResults: SmokeTestResult[] = [];
  private _rollbackMonitor: RollbackMonitor | null = null;
  private _deploymentId = '';
  private _deployedVersion = '';
  private _targetEnv: EnvColor = EnvColor.GREEN;
  private _startedAt = 0;

  constructor(
    config: BlueGreenConfig = {},
    clock: BgClock = Date.now,
    sleeper: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    envs?: EnvironmentManager
  ) {
    this._config = config;
    this._clock = clock;
    this._sleeper = sleeper;
    this._envs = envs ?? new EnvironmentManager(clock);
    this._switcher = new TrafficSwitcher(clock);
    this._gate = new HealthGate(clock);
    this._drainer = new RequestDrainer(this._envs, clock, sleeper, config.drainPollMs ?? 50);
    for (const p of config.healthProbes ?? []) this._gate.addProbe(p);
    if (config.rollbackTrigger) {
      this._rollbackMonitor = new RollbackMonitor(config.rollbackTrigger, clock);
    }
  }

  get state(): DeploymentState {
    return this._state;
  }

  get envs(): EnvironmentManager {
    return this._envs;
  }

  get switcher(): TrafficSwitcher {
    return this._switcher;
  }

  get rollbackMonitor(): RollbackMonitor | null {
    return this._rollbackMonitor;
  }

  /** Guarded deployment-state transition. */
  transition(to: DeploymentState, reason = ''): void {
    const allowed = DEPLOYMENT_TRANSITIONS[this._state];
    if (!allowed.includes(to)) {
      throw new InvalidDeploymentTransition(this._state, to);
    }
    this._transitions.push({ from: this._state, to, at: this._clock(), reason });
    this._state = to;
  }

  /**
   * Seed the initial topology: mark `color` LIVE serving `version`. Needed
   * before the first deployment when there's no prior slot history.
   */
  bootstrap(liveColor: EnvColor, version: string): void {
    this._envs.provision(liveColor, version);
    this._envs.markReady(liveColor);
    this._envs.markLive(liveColor);
    this._switcher.setSplit(liveColor === EnvColor.GREEN ? 100 : 0);
  }

  /** Deploy `version` with an instant traffic cutover. */
  async deploy(version: string, deploymentId = `deploy-${this._clock()}`): Promise<DeploymentRecord> {
    return this._run(version, deploymentId, null);
  }

  /**
   * Deploy `version` with a gradual traffic plan — e.g.
   * `TrafficSwitcher.plan([10, 50, 100], 60_000)`. The rollback monitor is
   * consulted at every step boundary.
   */
  async deployGradual(
    version: string,
    plan: ReadonlyArray<TrafficStep>,
    deploymentId = `deploy-${this._clock()}`
  ): Promise<DeploymentRecord> {
    return this._run(version, deploymentId, plan);
  }

  /**
   * Feed live-traffic metrics into the rollback monitor during SHIFTING /
   * DRAINING. Returns true when the monitor fired and rollback was initiated.
   */
  async feedMetric(errors: number, total: number, p99LatencyMs: number): Promise<boolean> {
    if (!this._rollbackMonitor) return false;
    this._rollbackMonitor.record(errors, total, p99LatencyMs);
    const verdict = this._rollbackMonitor.evaluate();
    if (!verdict.shouldRollback) return false;
    if (this._state !== DeploymentState.SHIFTING && this._state !== DeploymentState.DRAINING) {
      return false;
    }
    await this._executeRollback(verdict.reason ?? 'rollback trigger', undefined, this._targetEnv);
    return true;
  }

  /** Build the immutable record for the finished (or in-flight) deployment. */
  record(): DeploymentRecord {
    return {
      deploymentId: this._deploymentId,
      version: this._deployedVersion,
      targetEnv: this._targetEnv,
      transitions: this._transitions,
      smokeResults: this._smokeResults,
      finalState: this._state,
      rolledBack: this._state === DeploymentState.ROLLED_BACK,
      startedAt: this._startedAt,
      finishedAt: this._clock(),
    };
  }

  // ------------------------------------------------------------------ private

  private async _run(
    version: string,
    deploymentId: string,
    plan: ReadonlyArray<TrafficStep> | null
  ): Promise<DeploymentRecord> {
    // Allow a fresh deployment after a previous terminal run.
    if (this._state === DeploymentState.COMPLETE || this._state === DeploymentState.ROLLED_BACK) {
      this._state = DeploymentState.IDLE;
      this._transitions = [];
      this._smokeResults = [];
      this._rollbackMonitor?.reset();
    }
    if (this._state !== DeploymentState.IDLE) {
      throw new Error(`cannot deploy in state ${this._state}`);
    }
    this._deploymentId = deploymentId;
    this._deployedVersion = version;
    this._startedAt = this._clock();

    const target = this._envs.idleColor();
    const previousLive = this._envs.liveColor();
    const preShiftSplit = this._switcher.split;
    this._targetEnv = target;

    const fail = (reason: string): DeploymentRecord => {
      this.transition(DeploymentState.FAILED, reason);
      return this.record();
    };

    try {
      // 1. PROVISION — recycle a RETIRED slot first if needed.
      this.transition(DeploymentState.PROVISIONING, `provision ${target} with ${version}`);
      if (this._envs.env(target).state === EnvState.RETIRED) {
        this._envs.recycle(target);
      }
      this._envs.provision(target, version);
      this._envs.markReady(target);

      // 2. SMOKE TEST — a required failure fails the deploy with no traffic moved.
      this.transition(DeploymentState.SMOKE_TESTING, 'running smoke tests');
      const smoke = await this._runSmokeTests(target, version);
      if (smoke.some((s) => s.required && !s.passed)) {
        // Return the half-provisioned slot to EMPTY for the next attempt.
        this._envs.transition(target, EnvState.EMPTY);
        return fail('required smoke test failed');
      }

      // 3. HEALTH GATE
      this.transition(DeploymentState.HEALTH_GATING, 'evaluating health gate');
      const verdict = await this._gate.evaluate(target, version);
      this._envs.reportHealth(target, verdict.aggregateScore);
      if (!verdict.open) {
        this._envs.transition(target, EnvState.EMPTY);
        return fail(`health gate closed (score ${verdict.aggregateScore.toFixed(2)})`);
      }

      // 4. SHIFT — instant cutover or gradual plan; monitor checked per step.
      this.transition(DeploymentState.SHIFTING, plan ? 'gradual shift' : 'instant cutover');
      this._envs.markLive(target);
      let rolledBack = false;
      if (plan === null) {
        this._switcher.cutover(target === EnvColor.GREEN);
      } else {
        const toGreen = target === EnvColor.GREEN;
        try {
          await this._switcher.shiftGradual(
            plan.map((s) => ({
              greenPercent: toGreen ? s.greenPercent : 100 - s.greenPercent,
              dwellMs: s.dwellMs,
            })),
            this._sleeper,
            async () => {
              if (this._rollbackMonitor?.evaluate().shouldRollback) {
                throw new Error(ROLLBACK_SENTINEL);
              }
            }
          );
        } catch (e) {
          if (e instanceof Error && e.message === ROLLBACK_SENTINEL) {
            rolledBack = true;
          } else {
            throw e;
          }
        }
      }

      if (rolledBack) {
        await this._executeRollback('rollback monitor tripped during shift', preShiftSplit, target);
        return this.record();
      }

      // 5. DRAIN old live env, then retire it for reuse.
      this.transition(DeploymentState.DRAINING, 'draining previous live env');
      let forced = false;
      if (previousLive !== null && previousLive !== target) {
        this._envs.startDrain(previousLive);
        const d = await this._drainer.drain(previousLive, this._config.drainTimeoutMs ?? 30_000);
        forced = d.forced;
        this._envs.markRetired(previousLive);
      }

      this.transition(DeploymentState.COMPLETE, forced ? 'drained (forced)' : 'drained');
      return this.record();
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  private async _runSmokeTests(env: EnvColor, version: string): Promise<ReadonlyArray<SmokeTestResult>> {
    const results: SmokeTestResult[] = [];
    for (const test of this._config.smokeTests ?? []) {
      const t0 = this._clock();
      try {
        const ok = await test.run(env, version);
        results.push({
          name: test.name,
          passed: ok !== false,
          required: test.required,
          durationMs: this._clock() - t0,
        });
      } catch (e) {
        results.push({
          name: test.name,
          passed: false,
          required: test.required,
          durationMs: this._clock() - t0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    this._smokeResults = results;
    return results;
  }

  /**
   * Restore the pre-shift traffic split and mark the deployment rolled back.
   * The failed target is sent to DRAINING (traffic is already off it). A
   * previous-live env mid-drain stays draining — you can't un-drain — but the
   * restored split routes traffic to it while it finishes, so requests land.
   */
  private async _executeRollback(
    reason: string,
    preShiftSplit: { greenPercent: number } | undefined,
    failedTarget?: EnvColor
  ): Promise<void> {
    this.transition(DeploymentState.ROLLING_BACK, reason);
    if (preShiftSplit !== undefined) {
      this._switcher.setSplit(preShiftSplit.greenPercent);
    } else {
      // feedMetric path: restore the split before the most recent change.
      this._switcher.rollback();
    }
    if (failedTarget !== undefined) {
      try {
        this._envs.startDrain(failedTarget);
      } catch (e) {
        if (!(e instanceof InvalidEnvTransition)) throw e;
      }
    }
    this.transition(DeploymentState.ROLLED_BACK, 'traffic restored');
  }
}
