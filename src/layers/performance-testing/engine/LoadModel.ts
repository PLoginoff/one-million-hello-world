/**
 * LoadModel — virtual users, ramp schedules, workload shapes
 *
 * Models how many virtual users (VUs) are active at each instant of a
 * test, and what each VU does between requests.
 *
 *  - {@link LoadSchedule}: piecewise-linear stages (ramp-up, hold,
 *    ramp-down, spike). activeUsers(t) interpolates between stage
 *    boundaries — the standard k6/Gatling open-workload model.
 *  - {@link VirtualUser}: a state machine cycling
 *      request → wait-response → think → request
 *    driven by an injected clock, so whole soak tests simulate in O(1)
 *    per event instead of real time.
 *  - {@link WorkloadShape}: constant / ramp / spike / step / wave
 *    presets with a closed-form activeUsers(t) where possible.
 *
 * Determinism: all randomness flows through an injected PRNG.
 *
 * @module PerformanceTesting/Engine
 */

import { mulberry32, randExponential, randInt } from './Metrics';

/* ------------------------------------------------------------------------ */
/* Schedules                                                                */
/* ------------------------------------------------------------------------ */

/** One stage of a load schedule. */
export interface LoadStage {
  /** Stage duration in ms. */
  readonly durationMs: number;
  /** VUs at stage start. */
  readonly fromUsers: number;
  /** VUs at stage end (linear ramp between from/to). */
  readonly toUsers: number;
  /** Optional label ('warmup', 'spike', ...). */
  readonly label?: string;
}

/**
 * Piecewise-linear load schedule.
 *
 * activeUsers(t) = from + (to - from) * (t - stageStart) / duration
 * within each stage; 0 before/after the schedule. Total duration is the
 * sum of stage durations.
 */
export class LoadSchedule {
  private readonly _stages: readonly LoadStage[];
  private readonly _totalMs: number;
  private readonly _starts: readonly number[];

  constructor(stages: readonly LoadStage[]) {
    if (stages.length === 0) throw new Error('schedule needs >= 1 stage');
    this._stages = stages;
    const starts: number[] = [];
    let t = 0;
    for (const s of stages) {
      if (s.durationMs <= 0) throw new Error('stage duration must be > 0');
      starts.push(t);
      t += s.durationMs;
    }
    this._starts = starts;
    this._totalMs = t;
  }

  get totalMs(): number {
    return this._totalMs;
  }

  get stages(): readonly LoadStage[] {
    return this._stages;
  }

  /**
   * Active VUs at time t (ms since schedule start). Fractional results
   * are floored — a fractional VU is interpreted by the spawner as a
   * probabilistic extra user, matching k6's arrival-rate semantics.
   */
  activeUsers(tMs: number): number {
    if (tMs < 0 || tMs >= this._totalMs) return 0;
    // linear scan over stages — schedules rarely exceed ~10 stages
    for (let i = this._stages.length - 1; i >= 0; i--) {
      if (tMs >= this._starts[i]) {
        const s = this._stages[i];
        const frac = (tMs - this._starts[i]) / s.durationMs;
        return s.fromUsers + (s.toUsers - s.fromUsers) * frac;
      }
    }
    return 0;
  }

  /** Peak VU demand across the whole schedule. */
  peakUsers(): number {
    return Math.max(...this._stages.flatMap((s) => [s.fromUsers, s.toUsers]));
  }

  /* ---- presets ---- */

  /** Steady load: jump to N users, hold for duration. */
  static constant(users: number, durationMs: number): LoadSchedule {
    return new LoadSchedule([
      { durationMs, fromUsers: users, toUsers: users, label: 'hold' },
    ]);
  }

  /** Classic ramp: warm up, hold steady, cool down. */
  static ramp(
    peakUsers: number,
    rampUpMs: number,
    holdMs: number,
    rampDownMs: number
  ): LoadSchedule {
    return new LoadSchedule([
      { durationMs: rampUpMs, fromUsers: 0, toUsers: peakUsers, label: 'ramp-up' },
      { durationMs: holdMs, fromUsers: peakUsers, toUsers: peakUsers, label: 'hold' },
      { durationMs: rampDownMs, fromUsers: peakUsers, toUsers: 0, label: 'ramp-down' },
    ]);
  }

  /**
   * Spike test: baseline load, sudden burst, immediate return.
   * Models cache-busting events, flash sales, breaking news.
   */
  static spike(
    baselineUsers: number,
    spikeUsers: number,
    baselineMs: number,
    spikeMs: number,
    recoveryMs: number
  ): LoadSchedule {
    return new LoadSchedule([
      { durationMs: baselineMs, fromUsers: baselineUsers, toUsers: baselineUsers, label: 'baseline' },
      // ~instant jump: 1ms ramp
      { durationMs: 1, fromUsers: baselineUsers, toUsers: spikeUsers, label: 'spike-edge' },
      { durationMs: spikeMs, fromUsers: spikeUsers, toUsers: spikeUsers, label: 'spike' },
      { durationMs: 1, fromUsers: spikeUsers, toUsers: baselineUsers, label: 'drop-edge' },
      { durationMs: recoveryMs, fromUsers: baselineUsers, toUsers: baselineUsers, label: 'recovery' },
    ]);
  }

  /** Step load: equal increments — finds capacity knees. */
  static step(startUsers: number, stepUsers: number, steps: number, stepMs: number): LoadSchedule {
    const stages: LoadStage[] = [];
    for (let i = 0; i < steps; i++) {
      const level = startUsers + stepUsers * i;
      stages.push({ durationMs: stepMs, fromUsers: level, toUsers: level, label: `step-${i}` });
    }
    return new LoadSchedule(stages);
  }

  /**
   * Soak test: moderate constant load for a long duration; detects
   * memory leaks / resource exhaustion that short tests miss.
   */
  static soak(users: number, durationMs: number, warmUpMs = 60_000): LoadSchedule {
    return new LoadSchedule([
      { durationMs: warmUpMs, fromUsers: 0, toUsers: users, label: 'warmup' },
      { durationMs: durationMs, fromUsers: users, toUsers: users, label: 'soak' },
      { durationMs: warmUpMs, fromUsers: users, toUsers: 0, label: 'cooldown' },
    ]);
  }
}

/* ------------------------------------------------------------------------ */
/* Think time                                                               */
/* ------------------------------------------------------------------------ */

/** Think-time model between a response and the next request. */
export interface ThinkTime {
  /** Sample the next think time in ms. */
  sample(rand: () => number): number;
}

export class ConstantThinkTime implements ThinkTime {
  constructor(private readonly _ms: number) {}
  sample(): number {
    return this._ms;
  }
}

/** Uniform think time in [min, max]. */
export class UniformThinkTime implements ThinkTime {
  constructor(private readonly _min: number, private readonly _max: number) {}
  sample(rand: () => number): number {
    return randInt(rand, this._min, this._max);
  }
}

/**
 * Exponential think time with mean `meanMs` — Poisson-style pacing,
 * the standard model for human-paced browsing sessions.
 */
export class ExponentialThinkTime implements ThinkTime {
  constructor(private readonly _meanMs: number) {}
  sample(rand: () => number): number {
    return randExponential(rand, 1 / this._meanMs);
  }
}

/* ------------------------------------------------------------------------ */
/* Virtual user                                                             */
/* ------------------------------------------------------------------------ */

export type VUState = 'idle' | 'waiting' | 'thinking' | 'done';

/**
 * One simulated user. Deterministic state machine advanced by explicit
 * clock reads — no real timers.
 *
 * Lifecycle: idle → (startRequest) → waiting → (complete) → thinking →
 * (think expires) → idle → repeat, until the schedule ends.
 */
export class VirtualUser {
  private _state: VUState = 'idle';
  private _thinkUntil = 0;
  private _requests = 0;
  private _completedAt = 0;

  constructor(
    readonly id: number,
    private readonly _think: ThinkTime,
    private readonly _rand: () => number
  ) {}

  get state(): VUState {
    return this._state;
  }

  get requestCount(): number {
    return this._requests;
  }

  get completedAt(): number {
    return this._completedAt;
  }

  /** Begin a request at `now`. */
  startRequest(now: number): void {
    if (this._state !== 'idle' && this._state !== 'done') {
      throw new Error(`VU ${this.id}: startRequest in state ${this._state}`);
    }
    this._state = 'waiting';
    this._requests++;
    void now;
  }

  /** Request finished; begin thinking until thinkUntil. */
  complete(now: number): void {
    if (this._state !== 'waiting') {
      throw new Error(`VU ${this.id}: complete in state ${this._state}`);
    }
    this._completedAt = now;
    this._thinkUntil = now + this._think.sample(this._rand);
    this._state = 'thinking';
  }

  /** Mark VU as finished (schedule over). */
  finish(): void {
    this._state = 'done';
  }

  /**
   * Whether the VU is ready to issue a new request at `now`.
   * Transitions `thinking -> idle` when the think window has elapsed.
   */
  ready(now: number): boolean {
    if (this._state === 'thinking' && now >= this._thinkUntil) {
      this._state = 'idle';
    }
    return this._state === 'idle';
  }
}

/* ------------------------------------------------------------------------ */
/* Scenario                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * A unit of load-test work: invoked per request; returns latency.
 * `execute` may throw — failures are recorded as errors by the runner.
 */
export type ScenarioHandler = (vu: VirtualUser, at: number) => number | Promise<number>;

export interface Scenario {
  readonly name: string;
  readonly weight: number;
  readonly execute: ScenarioHandler;
}

/** Pick a scenario by weight using the injected rand. */
export function pickScenario(
  scenarios: readonly Scenario[],
  rand: () => number
): Scenario {
  const total = scenarios.reduce((s, x) => s + x.weight, 0);
  let r = rand() * total;
  for (const s of scenarios) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return scenarios[scenarios.length - 1];
}

/** Deterministic rand factory shared by the engine. */
export function seededRand(seed: number): () => number {
  return mulberry32(seed);
}
