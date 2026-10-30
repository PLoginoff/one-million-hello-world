/**
 * Instant Rollback with State Restore
 *
 * Captures each service's pre-switch state (image tag, config blob —
 * opaque blobs supplied by the environment) before a cutover, and on
 * rollback replays them in REVERSE wave order: dependents come down
 * before their dependencies so no caller ever sees its dependency
 * restored to old while it is still on new.
 *
 * Ordering detail: the forward plan deploys dependencies first (wave 0
 * first). Rollback inverts that — wave N-1 first, wave 0 last — the
 * exact invariant the forward order protects, applied to the restore
 * direction.
 *
 * Failure policy: a failed restore does NOT halt the rollback — leaving
 * half the stack on new while refusing to finish is worse. Failures are
 * collected in `manual` for follow-up, and dependent services still
 * restore underneath them.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import {
  BgClock2,
  RollbackReport,
  RollbackStep,
  ServiceStateSnapshot,
  SystemBgClock2,
  WavePlan,
} from './types';
import { waveIndexOf } from './WavePlanner';

export class RollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RollbackError';
  }
}

/** Environment hook restoring one service's captured state. */
export type StateRestorer = (service: string, state: unknown) => Promise<void> | void;

export class InstantRollback {
  private readonly _clock: BgClock2;
  private readonly _snapshots = new Map<string, ServiceStateSnapshot>();
  private readonly _plan: WavePlan;

  constructor(plan: WavePlan, clock: BgClock2 = new SystemBgClock2()) {
    this._plan = plan;
    this._clock = clock;
  }

  /** Capture pre-switch state for a service — call BEFORE its wave deploys. */
  capture(service: string, state: unknown): ServiceStateSnapshot {
    const snap: ServiceStateSnapshot = {
      service,
      state,
      capturedAt: this._clock.now(),
    };
    this._snapshots.set(service, snap);
    return snap;
  }

  /** True when a snapshot exists for every service in the plan. */
  get ready(): boolean {
    return this._plan.order.every((s) => this._snapshots.has(s));
  }

  /**
   * Roll back: restore every captured service in reverse wave order.
   * Restores are attempted even after failures — the stack must come
   * back coherently; stragglers are reported in `manual`.
   */
  async rollback(restore: StateRestorer): Promise<RollbackReport> {
    const waveOf = waveIndexOf(this._plan);
    const orderDesc = [...this._plan.order].sort(
      (a, b) => (waveOf.get(b) ?? 0) - (waveOf.get(a) ?? 0)
    );
    const steps: RollbackStep[] = [];
    const manual: string[] = [];
    for (const service of orderDesc) {
      const snap = this._snapshots.get(service);
      if (!snap) {
        steps.push({
          service,
          ok: false,
          error: 'no captured state — was it captured before its wave?',
        });
        manual.push(service);
        continue;
      }
      try {
        await restore(service, snap.state);
        steps.push({ service, ok: true, detail: `restored from ${snap.capturedAt}` });
      } catch (err) {
        steps.push({
          service,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        manual.push(service);
      }
    }
    return {
      ok: manual.length === 0,
      rolledBackAt: this._clock.now(),
      steps,
      manual,
    };
  }

  /** Services in the plan lacking a captured snapshot. */
  missing(): string[] {
    return this._plan.order.filter((s) => !this._snapshots.has(s));
  }
}
