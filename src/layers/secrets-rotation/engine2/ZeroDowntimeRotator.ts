/**
 * Secrets Rotation — Zero-Downtime Rotation Orchestrator
 *
 * Drives a *single* secret through a staged rotation that never leaves
 * consumers without valid key material:
 *
 *   IDLE → GENERATING → STAGING → ACTIVATING → DUAL_KEY → DRAINING → DONE
 *                    ↘                                        ↙
 *                     ────────── FAILED → RECOVERING ─────────
 *
 * The DUAL_KEY window is the zero-downtime core: after the new key
 * activates, the old key stays valid for verification for `graceMs`
 * (delegating to {@link KeyRing}'s RETIRING semantics). Consumers that
 * reload during the window seamlessly move to the new key; consumers
 * that don't are caught by the usage tracker and reported as blockers
 * instead of being cut off.
 *
 * Each stage is an explicit checkpoint so a failure mid-rotation can be
 * RESUMED or ROLLED BACK — see {@link PartialRotationRecovery}.
 *
 * Timing is driven by `tick()` + the injected clock — never by timers —
 * so tests advance the clock manually for full determinism.
 *
 * @module SecretsRotation/Engine2
 */

import { KeyRing } from '../rotation/KeyRing';
import {
  KeyMaterial,
  KeyState,
  ManagedKey,
  RotationClock,
  RotationPolicy,
} from '../rotation/RotationTypes';
import { SecretUsageTracker } from './SecretUsageTracker';

export enum RotationStage {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  STAGING = 'STAGING',
  ACTIVATING = 'ACTIVATING',
  /** New key active; old key in its dual-key validity window. */
  DUAL_KEY = 'DUAL_KEY',
  /** Waiting for stale consumers to reload before retiring the old key. */
  DRAINING = 'DRAINING',
  DONE = 'DONE',
  FAILED = 'FAILED',
  RECOVERING = 'RECOVERING',
}

/** Pluggable key-material source (KMS call in production). */
export type KeyMaterialFactory = (
  secretId: string,
  generation: number
) => Promise<KeyMaterial> | KeyMaterial;

export interface RotationRun {
  readonly runId: string;
  readonly secretId: string;
  stage: RotationStage;
  readonly startedAt: number;
  stageEnteredAt: number;
  newMaterial?: KeyMaterial;
  oldKeyId?: string;
  newKeyId?: string;
  /** Absolute end of the dual-key window. */
  dualKeyEndsAt?: number;
  error?: string;
  /** Consumers still on the old generation at last check. */
  blockers: string[];
  readonly history: { stage: RotationStage; at: number; note: string }[];
}

export interface RotatorOptions {
  readonly ring: KeyRing;
  readonly policy: RotationPolicy;
  readonly factory: KeyMaterialFactory;
  readonly tracker?: SecretUsageTracker;
  readonly clock?: RotationClock;
  /**
   * How long DRAINING waits for stale consumers before giving up and
   * finishing anyway (ms). Default: graceMs (i.e. we wait out the window).
   */
  readonly drainTimeoutMs?: number;
  /** Minimum time the new key stays in STAGING before activation (ms). */
  readonly stagingMs?: number;
}

let runCounter = 0;

export class ZeroDowntimeRotator {
  private readonly _ring: KeyRing;
  private readonly _policy: RotationPolicy;
  private readonly _factory: KeyMaterialFactory;
  private readonly _tracker?: SecretUsageTracker;
  private readonly _clock: RotationClock;
  private readonly _drainTimeoutMs: number;
  private readonly _stagingMs: number;
  private _run: RotationRun | null = null;

  constructor(options: RotatorOptions) {
    this._ring = options.ring;
    this._policy = options.policy;
    this._factory = options.factory;
    this._tracker = options.tracker;
    this._clock = options.clock ?? Date.now;
    this._drainTimeoutMs = options.drainTimeoutMs ?? options.policy.graceMs;
    this._stagingMs = options.stagingMs ?? options.policy.stagingMs ?? 0;
  }

  get run(): RotationRun | null {
    return this._run;
  }

  get stage(): RotationStage {
    return this._run?.stage ?? RotationStage.IDLE;
  }

  private _enter(stage: RotationStage, note: string): void {
    const r = this._run!;
    r.stage = stage;
    r.stageEnteredAt = this._clock();
    r.history.push({ stage, at: this._clock(), note });
  }

  /**
   * Begin a rotation run. Generates new material and moves it to STAGING.
   * The old ACTIVE key is untouched until ACTIVATING.
   */
  async begin(): Promise<RotationRun> {
    if (this._run && this._run.stage !== RotationStage.DONE && this._run.stage !== RotationStage.FAILED) {
      throw new Error(`rotation already in progress (stage ${this._run.stage})`);
    }
    const run: RotationRun = {
      runId: `rot-${++runCounter}`,
      secretId: this._policy.secretId,
      stage: RotationStage.IDLE,
      startedAt: this._clock(),
      stageEnteredAt: this._clock(),
      blockers: [],
      history: [],
    };
    this._run = run;
    this._enter(RotationStage.GENERATING, 'generating new key material');
    try {
      const material = await this._factory(this._policy.secretId, this._ring.highestGeneration + 1);
      run.newMaterial = material;
      run.newKeyId = material.keyId;
      this._ring.add(material);
      this._ring.transition(material.keyId, KeyState.STAGING);
      this._enter(RotationStage.STAGING, `staged ${material.keyId}`);
    } catch (e) {
      run.error = e instanceof Error ? e.message : String(e);
      this._enter(RotationStage.FAILED, `generation failed: ${run.error}`);
    }
    return run;
  }

  /**
   * Advance the rotation one stage when its timing preconditions hold.
   * Returns false when the current stage is still waiting (staging soak,
   * dual-key window, draining) — call again after the clock advances.
   */
  async tick(): Promise<boolean> {
    const r = this._run;
    if (!r) return false;
    const now = this._clock();
    const elapsed = now - r.stageEnteredAt;

    switch (r.stage) {
      case RotationStage.STAGING: {
        if (elapsed < this._stagingMs) return false;
        this._enter(RotationStage.ACTIVATING, 'staging soak complete');
        return this._activate();
      }
      case RotationStage.ACTIVATING: {
        return this._activate();
      }
      case RotationStage.DUAL_KEY: {
        if (elapsed < this._policy.graceMs) return false;
        this._enter(RotationStage.DRAINING, 'dual-key window elapsed');
        return this._drain();
      }
      case RotationStage.DRAINING: {
        return this._drain();
      }
      default:
        return false;
    }
  }

  /** Cut over: retire old ACTIVE (into dual-key), activate the staged key. */
  private _activate(): boolean {
    const r = this._run!;
    try {
      const old = this._ring.active();
      if (old) {
        r.oldKeyId = old.material.keyId;
        this._ring.transition(old.material.keyId, KeyState.RETIRING, {
          graceMs: this._policy.graceMs,
        });
      }
      this._ring.transition(r.newKeyId!, KeyState.ACTIVE);
      r.dualKeyEndsAt = this._clock() + this._policy.graceMs;
      this._enter(
        RotationStage.DUAL_KEY,
        old ? `activated ${r.newKeyId}; ${old.material.keyId} in dual-key grace` : `activated ${r.newKeyId} (no prior key)`
      );
      return true;
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
      this._enter(RotationStage.FAILED, `activation failed: ${r.error}`);
      return true;
    }
  }

  /** Retire the old key once consumers have reloaded (or we time out). */
  private _drain(): boolean {
    const r = this._run!;
    const now = this._clock();
    const elapsed = now - r.stageEnteredAt;

    // Who's still on the old generation?
    if (this._tracker && r.oldKeyId) {
      const oldGen = this._ring.get(r.oldKeyId)?.material.generation;
      if (oldGen !== undefined) {
        r.blockers = this._tracker
          .staleConsumers(r.secretId, oldGen + 1)
          .map((c) => c.serviceId);
      }
    }

    const timedOut = elapsed >= this._drainTimeoutMs;
    if (r.blockers.length === 0 || timedOut) {
      const old = this._ring.retiring();
      if (old) {
        if (this._policy.autoRevokeOnGraceEnd !== false) {
          this._ring.transition(old.material.keyId, KeyState.REVOKED, {
            reason: 'grace window ended',
          });
        } else {
          this._ring.transition(old.material.keyId, KeyState.RETIRED);
        }
      }
      this._enter(
        RotationStage.DONE,
        timedOut && r.blockers.length > 0
          ? `completed after drain timeout; ${r.blockers.length} consumer(s) never reloaded`
          : 'completed — all consumers on new generation'
      );
      return true;
    }
    return false; // still draining
  }

  /**
   * Abort a failed run, restoring the pre-rotation state:
   *  - If we never activated: revoke the staged/new key — old key stays
   *    ACTIVE untouched.
   *  - If we activated: re-activate the old key (it's still within its
   *    RETIRING window) and revoke the bad new key. This is the partial
   *    rollback path — order matters: restore the old FIRST so there is
   *    never a moment with no ACTIVE key.
   */
  rollback(reason = 'rotation failure'): RotationRun {
    const r = this._run;
    if (!r) throw new Error('no run to roll back');
    if (r.stage === RotationStage.DONE) throw new Error('cannot roll back a completed rotation');
    this._enter(RotationStage.RECOVERING, reason);

    const activated = r.oldKeyId !== undefined;
    if (activated) {
      // Old key is RETIRING — KEY_TRANSITIONS doesn't allow RETIRING→ACTIVE,
      // so we lift it back via REVOKED→… no: we must restore state directly.
      const old = this._ring.get(r.oldKeyId!);
      if (old && (old.state === KeyState.RETIRING || old.state === KeyState.RETIRED)) {
        // Direct state restore — bypass the forward-only transition table.
        old.state = KeyState.ACTIVE;
        old.validUntil = undefined;
        old.activatedAt = this._clock();
      }
    }
    if (r.newKeyId) {
      const k = this._ring.get(r.newKeyId);
      if (k && k.state !== KeyState.REVOKED) {
        // Move through a legal path: any non-terminal state may REVOKE.
        this._ring.transition(r.newKeyId, KeyState.REVOKED, { reason });
      }
    }
    this._enter(
      RotationStage.FAILED,
      activated ? 'rolled back: old key restored, new key revoked' : 'rolled back: staged key revoked'
    );
    return r;
  }

  /** Managed keys for inspection. */
  keys(): ReadonlyArray<ManagedKey> {
    return this._ring.keys;
  }
}
