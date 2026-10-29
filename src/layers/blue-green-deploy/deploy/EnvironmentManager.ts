/**
 * Blue-Green Deploy — Environment Manager
 *
 * Owns the two environment slots (blue & green) and their lifecycle state
 * machines. Each environment is a guarded {@link EnvState} machine —
 * illegal transitions throw, so an environment can never jump LIVE→EMPTY
 * while still serving traffic, and a RETIRED slot must pass through EMPTY
 * before re-provisioning (preventing stale-artifact leaks).
 *
 * Also tracks in-flight request counts that the drainer waits on.
 *
 * @module BlueGreenDeploy/Deploy
 */

import {
  BgClock,
  EnvColor,
  EnvState,
  Environment,
  ENV_TRANSITIONS,
} from './BlueGreenTypes';

export class InvalidEnvTransition extends Error {
  constructor(color: EnvColor, from: EnvState, to: EnvState) {
    super(`invalid ${color} transition ${from} → ${to}`);
    this.name = 'InvalidEnvTransition';
  }
}

export class EnvironmentManager {
  private readonly _clock: BgClock;
  private readonly _envs: Map<EnvColor, Environment>;
  private readonly _history: Array<{ color: EnvColor; from: EnvState; to: EnvState; at: number }> = [];

  constructor(clock: BgClock = Date.now) {
    this._clock = clock;
    this._envs = new Map([
      [EnvColor.BLUE, this._freshEnv(EnvColor.BLUE)],
      [EnvColor.GREEN, this._freshEnv(EnvColor.GREEN)],
    ]);
  }

  private _freshEnv(color: EnvColor): Environment {
    return {
      color,
      state: EnvState.EMPTY,
      version: null,
      healthScore: 0,
      inFlight: 0,
      lastHealthCheckAt: 0,
    };
  }

  env(color: EnvColor): Readonly<Environment> {
    const e = this._envs.get(color);
    if (!e) throw new Error(`unknown env ${color}`);
    return e;
  }

  /** Mutable handle for engine-internal bookkeeping (in-flight, health). */
  envMut(color: EnvColor): Environment {
    const e = this._envs.get(color);
    if (!e) throw new Error(`unknown env ${color}`);
    return e;
  }

  get history(): ReadonlyArray<{ color: EnvColor; from: EnvState; to: EnvState; at: number }> {
    return this._history;
  }

  /** Which environment is currently LIVE (if any). */
  liveColor(): EnvColor | null {
    if (this._envs.get(EnvColor.BLUE)?.state === EnvState.LIVE) return EnvColor.BLUE;
    if (this._envs.get(EnvColor.GREEN)?.state === EnvState.LIVE) return EnvColor.GREEN;
    return null;
  }

  /** The non-live slot — where the next deployment lands. */
  idleColor(): EnvColor {
    const live = this.liveColor();
    return live === EnvColor.BLUE ? EnvColor.GREEN : EnvColor.BLUE;
  }

  /** Guarded transition. */
  transition(color: EnvColor, to: EnvState, version?: string): void {
    const e = this.envMut(color);
    const allowed = ENV_TRANSITIONS[e.state];
    if (!allowed.includes(to)) {
      throw new InvalidEnvTransition(color, e.state, to);
    }
    this._history.push({ color, from: e.state, to, at: this._clock() });
    e.state = to;
    if (version !== undefined) e.version = version;
  }

  /** Provision a version into an EMPTY slot → PROVISIONING → READY handled by caller. */
  provision(color: EnvColor, version: string): void {
    this.transition(color, EnvState.PROVISIONING, version);
  }

  markReady(color: EnvColor): void {
    this.transition(color, EnvState.READY);
  }

  markLive(color: EnvColor): void {
    this.transition(color, EnvState.LIVE);
  }

  startDrain(color: EnvColor): void {
    this.transition(color, EnvState.DRAINING);
  }

  markRetired(color: EnvColor): void {
    this.transition(color, EnvState.RETIRED);
  }

  /** Reset a RETIRED slot to EMPTY so the next deployment can use it. */
  recycle(color: EnvColor): void {
    this.transition(color, EnvState.EMPTY);
  }

  // ------------------------------------------------------- in-flight tracking

  /** Register a request starting on an environment. O(1). */
  requestStarted(color: EnvColor): void {
    this.envMut(color).inFlight++;
  }

  /** Register a request completing. Never goes below zero. */
  requestFinished(color: EnvColor): void {
    const e = this.envMut(color);
    e.inFlight = Math.max(0, e.inFlight - 1);
  }

  /** Whether an environment has fully drained. */
  isDrained(color: EnvColor): boolean {
    return this.env(color).inFlight === 0;
  }

  /** Record a health score from the gate. */
  reportHealth(color: EnvColor, score: number): void {
    const e = this.envMut(color);
    e.healthScore = Math.max(0, Math.min(1, score));
    e.lastHealthCheckAt = this._clock();
  }
}
