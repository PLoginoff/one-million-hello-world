/**
 * Strategy Engine — shared types.
 *
 * Vocabulary:
 * - `StrategyEngineClock`  — injectable clock for experiment windows and
 *                            canary ramp schedules.
 * - `AbTestingEngine`      — variant assignment via consistent hashing,
 *                            conversion tracking, Welch's t-test significance.
 * - `CanaryEvaluator`      — percentage rollout with sticky assignment and
 *                            scheduled ramps.
 * - `KillSwitch`           — instant global/per-key disable with reason + audit.
 * - `VariantLeaderboard`   — per-variant performance metrics ranked.
 *
 * Hashing: FNV-1a 32-bit (fast, stable, no crypto needed) over
 * `experimentId:subjectId` — assignment is deterministic per
 * (experiment, subject) so a user stays in their bucket across
 * processes and restarts with zero coordination.
 *
 * @module StrategyLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface StrategyEngineClock {
  now(): number;
}

export class SystemEngineClock implements StrategyEngineClock {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class ManualEngineClock implements StrategyEngineClock {
  private _t = 0;
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class StrategyEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StrategyEngineError';
    this.code = code;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ExperimentNotFoundError extends StrategyEngineError {
  constructor(id: string) {
    super('EXPERIMENT_NOT_FOUND', `No experiment "${id}"`);
    this.name = 'ExperimentNotFoundError';
  }
}

export class UnknownVariantError extends StrategyEngineError {
  constructor(experimentId: string, variant: string) {
    super('UNKNOWN_VARIANT', `Experiment "${experimentId}" has no variant "${variant}"`);
    this.name = 'UnknownVariantError';
  }
}

/** FNV-1a 32-bit hash — deterministic, stable across runs. */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619 with 32-bit overflow, done via shifts to avoid FP precision loss
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
