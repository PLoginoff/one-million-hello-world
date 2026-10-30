/**
 * Chaos Safety Validator — pre-flight checks
 *
 * Before an experiment is allowed to run, it must pass a checklist of
 * safety invariants — the same class of gate real chaos platforms
 * enforce before granting a "run" token. This module separates
 * validation (static, before anything is armed) from runtime abort
 * monitoring (dynamic, while faults fire).
 *
 * Checks performed:
 *
 *   1. Blast-radius caps — percentage ≤ maxPercentage, explicit target
 *      count ≤ maxTargets, filter present when required.
 *   2. Fault-parameter sanity — probabilities in [0,1], latency jitter
 *      ordered, packet-loss rates in range, severity ceilings respected
 *      (e.g. CRITICAL faults can't run at > 50% blast radius).
 *   3. Abort-condition coverage — at least one abort condition must be
 *      present unless the experiment is explicitly exempt; every
 *      condition must reference a known metric and have a sane window.
 *   4. Hypothesis coverage — at least one steady-state probe; each
 *      probe's tolerance must be internally consistent (e.g. min ≤ max
 *      for IN_RANGE).
 *   5. Timing sanity — duration positive and within limits; warmup
 *      non-negative; total runtime (warmup + duration) ≤ maxTotalMs.
 *   6. Schedule windows — no overlap with declared blackout windows at
 *      the intended start time.
 *
 * Each check yields a Finding with a severity — `error` findings block
 * the experiment; `warning` findings allow it but are surfaced in the
 * verdict. The validator is pure (no I/O) and fully deterministic.
 *
 * Complexity: O(#faults + #abortConditions + #probes + #windows).
 *
 * @module ChaosEngineering/Engine2
 */

import {
  AbortCondition,
  BlastRadiusScope,
  ChaosExperimentDefinition,
  FaultDescriptor,
  FaultKind,
  FaultSeverity,
  SafetyWindow,
  SteadyStateProbe,
  Tolerance,
  ToleranceKind,
} from '../engine/ChaosEngineTypes';

/** Severity of a validation finding. */
export enum FindingSeverity {
  /** Informational — surfaced for transparency. */
  INFO = 'info',
  /** Warning — experiment may run but should be reviewed. */
  WARNING = 'warning',
  /** Error — blocks the experiment outright. */
  ERROR = 'error',
}

/** A single validation finding, tied to a check and a location. */
export interface SafetyFinding {
  readonly severity: FindingSeverity;
  /** Identifier of the check that produced this finding (stable for tests). */
  readonly check: string;
  /** Dotted location, e.g. 'faults[0].probability'. */
  readonly location: string;
  readonly message: string;
}

/** Outcome of a validation pass. */
export interface ValidationVerdict {
  readonly allowed: boolean;
  readonly findings: readonly SafetyFinding[];
  /** Counts by severity, for dashboards. */
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly summary: string;
}

/** Tuning knobs for the validator — all optional with safe defaults. */
export interface SafetyValidatorConfig {
  /** Hard cap on BlastRadiusScope.percentage. Default 0.5 (50%). */
  readonly maxBlastRadiusPct: number;
  /** Hard cap on explicitly enumerated targets. Default 10. */
  readonly maxExplicitTargets: number;
  /** Whether a scope filter/targetIds is required when percentage < 1. */
  readonly requireScopeNarrowing: boolean;
  /** Per-severity max blast-radius percentage. */
  readonly severityBlastCaps: Readonly<Record<FaultSeverity, number>>;
  /** Whether at least one abort condition is required. Default true. */
  readonly requireAbortConditions: boolean;
  /** Minimum abort conditions. Default 1. */
  readonly minAbortConditions: number;
  /** Maximum abort condition evaluation window (ms). */
  readonly maxAbortWindowMs: number;
  /** Whether at least one hypothesis probe is required. Default true. */
  readonly requireHypothesis: boolean;
  /** Max experiment duration (ms). Default 1 hour. */
  readonly maxDurationMs: number;
  /** Max total runtime including warmup (ms). Default 2 hours. */
  readonly maxTotalMs: number;
  /** Declared schedule windows; blackout windows block at start time. */
  readonly safetyWindows: readonly SafetyWindow[];
  /** Metrics that abort conditions are allowed to reference. */
  readonly knownMetrics: ReadonlySet<string> | null;
}

export const DEFAULT_SAFETY_CONFIG: SafetyValidatorConfig = {
  maxBlastRadiusPct: 0.5,
  maxExplicitTargets: 10,
  requireScopeNarrowing: false,
  severityBlastCaps: {
    [FaultSeverity.LOW]: 1.0,
    [FaultSeverity.MEDIUM]: 0.75,
    [FaultSeverity.HIGH]: 0.5,
    [FaultSeverity.CRITICAL]: 0.1,
  },
  requireAbortConditions: true,
  minAbortConditions: 1,
  maxAbortWindowMs: 5 * 60 * 1000,
  requireHypothesis: true,
  maxDurationMs: 60 * 60 * 1000,
  maxTotalMs: 2 * 60 * 60 * 1000,
  safetyWindows: [],
  knownMetrics: null,
};

/** Raised when the validator itself is fed a malformed definition. */
export class MalformedExperimentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedExperimentError';
  }
}

/**
 * Pre-flight safety validator for chaos experiments.
 */
export class ChaosSafetyValidator {
  private readonly _config: SafetyValidatorConfig;

  constructor(config: Partial<SafetyValidatorConfig> = {}) {
    this._config = { ...DEFAULT_SAFETY_CONFIG, ...config };
  }

  get config(): SafetyValidatorConfig {
    return this._config;
  }

  /** Run all checks; the verdict aggregates findings. */
  validate(
    def: ChaosExperimentDefinition,
    intendedStartMs?: number
  ): ValidationVerdict {
    this._assertWellFormed(def);

    const findings: SafetyFinding[] = [];
    findings.push(...this._checkBlastRadius(def.scope, def.faults));
    for (let i = 0; i < def.faults.length; i++) {
      findings.push(...this._checkFault(def.faults[i], i));
    }
    findings.push(...this._checkAbortConditions(def.abortConditions));
    findings.push(...this._checkHypothesis(def.hypothesis));
    findings.push(...this._checkTiming(def));
    if (intendedStartMs !== undefined) {
      findings.push(...this._checkWindows(intendedStartMs));
    }

    const errors = findings.filter((f) => f.severity === FindingSeverity.ERROR).length;
    const warnings = findings.filter((f) => f.severity === FindingSeverity.WARNING).length;
    const infos = findings.filter((f) => f.severity === FindingSeverity.INFO).length;
    const allowed = errors === 0;
    const summary = allowed
      ? warnings > 0
        ? `allowed with ${warnings} warning(s)`
        : 'all checks passed'
      : `blocked by ${errors} error(s)`;
    return { allowed, findings, errorCount: errors, warningCount: warnings, infoCount: infos, summary };
  }

  /** Convenience: validate and throw on block. */
  assertAllowed(def: ChaosExperimentDefinition, intendedStartMs?: number): void {
    const v = this.validate(def, intendedStartMs);
    if (!v.allowed) {
      const msgs = v.findings
        .filter((f) => f.severity === FindingSeverity.ERROR)
        .map((f) => `[${f.check}] ${f.location}: ${f.message}`)
        .join('; ');
      throw new MalformedExperimentError(`experiment '${def.id}' blocked: ${msgs}`);
    }
  }

  /* ----- structural sanity -------------------------------------------- */

  private _assertWellFormed(def: ChaosExperimentDefinition): void {
    if (typeof def.id !== 'string' || def.id.length === 0) {
      throw new MalformedExperimentError('experiment id missing');
    }
    if (!Array.isArray(def.faults)) {
      throw new MalformedExperimentError('faults must be an array');
    }
    if (def.faults.length === 0) {
      throw new MalformedExperimentError('experiment must define ≥1 fault');
    }
    if (def.scope === undefined || def.scope === null) {
      throw new MalformedExperimentError('scope is required');
    }
    if (!Number.isFinite(def.durationMs)) {
      throw new MalformedExperimentError('durationMs must be finite');
    }
  }

  /* ----- check groups --------------------------------------------------- */

  private _checkBlastRadius(
    scope: BlastRadiusScope,
    faults: readonly FaultDescriptor[]
  ): SafetyFinding[] {
    const out: SafetyFinding[] = [];
    const cfg = this._config;
    if (scope.percentage <= 0 || scope.percentage > 1) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'blast-radius.range',
        location: 'scope.percentage',
        message: `percentage ${scope.percentage} outside (0, 1]`,
      });
    }
    if (scope.percentage > cfg.maxBlastRadiusPct) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'blast-radius.cap',
        location: 'scope.percentage',
        message: `percentage ${scope.percentage} exceeds cap ${cfg.maxBlastRadiusPct}`,
      });
    }
    // Per-severity tightening: the strictest cap is min(config, severity).
    let worstCap = cfg.maxBlastRadiusPct;
    let worstSeverity: FaultSeverity | null = null;
    for (const f of faults) {
      const cap = cfg.severityBlastCaps[f.severity] ?? 1;
      if (cap < worstCap) {
        worstCap = cap;
        worstSeverity = f.severity;
      }
    }
    if (scope.percentage > worstCap && worstSeverity !== null) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'blast-radius.severity-cap',
        location: 'scope.percentage',
        message:
          `percentage ${scope.percentage} exceeds ${worstSeverity} fault cap ${worstCap}`,
      });
    }
    if (scope.targetIds !== undefined && scope.targetIds.size > cfg.maxExplicitTargets) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'blast-radius.targets-cap',
        location: 'scope.targetIds',
        message: `${scope.targetIds.size} explicit targets exceeds cap ${cfg.maxExplicitTargets}`,
      });
    }
    if (scope.maxAffectedTargets !== undefined && scope.maxAffectedTargets < 0) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'blast-radius.max-targets',
        location: 'scope.maxAffectedTargets',
        message: 'maxAffectedTargets must be ≥ 0',
      });
    }
    if (
      cfg.requireScopeNarrowing &&
      scope.percentage >= 1 &&
      scope.targetIds === undefined &&
      scope.targetFilter === undefined
    ) {
      out.push({
        severity: FindingSeverity.WARNING,
        check: 'blast-radius.narrowing',
        location: 'scope',
        message: '100% blast radius with no narrowing — consider adding targetIds or a filter',
      });
    }
    return out;
  }

  private _checkFault(f: FaultDescriptor, idx: number): SafetyFinding[] {
    const out: SafetyFinding[] = [];
    const loc = (p: string) => `faults[${idx}].${p}`;
    if (f.probability < 0 || f.probability > 1) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'fault.probability',
        location: loc('probability'),
        message: `probability ${f.probability} outside [0, 1]`,
      });
    }
    switch (f.kind) {
      case FaultKind.LATENCY: {
        if (f.latencyMs === undefined) {
          out.push({
            severity: FindingSeverity.ERROR,
            check: 'fault.latency.required',
            location: loc('latencyMs'),
            message: 'latency fault requires latencyMs',
          });
        } else if (Array.isArray(f.latencyMs)) {
          const [lo, hi] = f.latencyMs as readonly [number, number];
          if (lo > hi) {
            out.push({
              severity: FindingSeverity.ERROR,
              check: 'fault.latency.order',
              location: loc('latencyMs'),
              message: `jitter range [${lo}, ${hi}] has lo > hi`,
            });
          }
          if (lo < 0 || hi < 0) {
            out.push({
              severity: FindingSeverity.ERROR,
              check: 'fault.latency.negative',
              location: loc('latencyMs'),
              message: 'latency jitter must be non-negative',
            });
          }
        } else if (typeof f.latencyMs === 'number' && f.latencyMs < 0) {
          out.push({
            severity: FindingSeverity.ERROR,
            check: 'fault.latency.negative',
            location: loc('latencyMs'),
            message: 'latencyMs must be non-negative',
          });
        }
        break;
      }
      case FaultKind.PACKET_LOSS: {
        for (const [name, v] of [
          ['dropRate', f.dropRate],
          ['duplicateRate', f.duplicateRate],
        ] as const) {
          if (v !== undefined && (v < 0 || v > 1)) {
            out.push({
              severity: FindingSeverity.ERROR,
              check: 'fault.packet-loss.range',
              location: loc(name),
              message: `${name} ${v} outside [0, 1]`,
            });
          }
        }
        break;
      }
      case FaultKind.RESOURCE: {
        if (f.burnMs !== undefined && f.burnMs < 0) {
          out.push({
            severity: FindingSeverity.ERROR,
            check: 'fault.resource.burn',
            location: loc('burnMs'),
            message: 'burnMs must be non-negative',
          });
        }
        if (f.churnBytes !== undefined && f.churnBytes < 0) {
          out.push({
            severity: FindingSeverity.ERROR,
            check: 'fault.resource.churn',
            location: loc('churnBytes'),
            message: 'churnBytes must be non-negative',
          });
        }
        break;
      }
      case FaultKind.ABORT: {
        if (f.abortReason === undefined || f.abortReason.length === 0) {
          out.push({
            severity: FindingSeverity.WARNING,
            check: 'fault.abort.reason',
            location: loc('abortReason'),
            message: 'abort fault without a reason makes reports harder to read',
          });
        }
        break;
      }
      case FaultKind.ERROR: {
        if (f.errorCode === undefined && f.errorMessage === undefined) {
          out.push({
            severity: FindingSeverity.WARNING,
            check: 'fault.error.detail',
            location: loc('errorCode'),
            message: 'error fault should set errorCode or errorMessage for realism',
          });
        }
        break;
      }
    }
    return out;
  }

  private _checkAbortConditions(conds: readonly AbortCondition[]): SafetyFinding[] {
    const out: SafetyFinding[] = [];
    const cfg = this._config;
    if (cfg.requireAbortConditions && conds.length < cfg.minAbortConditions) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'abort.required',
        location: 'abortConditions',
        message: `need ≥${cfg.minAbortConditions} abort condition(s), found ${conds.length}`,
      });
    }
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      const loc = `abortConditions[${i}]`;
      if (c.windowMs <= 0 || c.windowMs > cfg.maxAbortWindowMs) {
        out.push({
          severity: FindingSeverity.ERROR,
          check: 'abort.window',
          location: `${loc}.windowMs`,
          message: `windowMs ${c.windowMs} outside (0, ${cfg.maxAbortWindowMs}]`,
        });
      }
      if (!Number.isFinite(c.threshold)) {
        out.push({
          severity: FindingSeverity.ERROR,
          check: 'abort.threshold',
          location: `${loc}.threshold`,
          message: 'threshold must be finite',
        });
      }
      if (c.breachRatio !== undefined && (c.breachRatio <= 0 || c.breachRatio > 1)) {
        out.push({
          severity: FindingSeverity.ERROR,
          check: 'abort.breach-ratio',
          location: `${loc}.breachRatio`,
          message: `breachRatio ${c.breachRatio} outside (0, 1]`,
        });
      }
      if (cfg.knownMetrics !== null && !cfg.knownMetrics.has(c.metric)) {
        out.push({
          severity: FindingSeverity.WARNING,
          check: 'abort.metric',
          location: `${loc}.metric`,
          message: `unknown metric '${c.metric}' — is it instrumented?`,
        });
      }
    }
    return out;
  }

  private _checkHypothesis(probes: readonly SteadyStateProbe[]): SafetyFinding[] {
    const out: SafetyFinding[] = [];
    const cfg = this._config;
    if (cfg.requireHypothesis && probes.length === 0) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'hypothesis.required',
        location: 'hypothesis',
        message: 'experiment must declare at least one steady-state probe',
      });
    }
    for (let i = 0; i < probes.length; i++) {
      const p = probes[i];
      const loc = `hypothesis[${i}]`;
      if (p.minSamples <= 0) {
        out.push({
          severity: FindingSeverity.ERROR,
          check: 'hypothesis.min-samples',
          location: `${loc}.minSamples`,
          message: 'minSamples must be positive',
        });
      }
      out.push(...this._checkTolerance(p.tolerance, `${loc}.tolerance`));
    }
    return out;
  }

  private _checkTolerance(t: Tolerance, loc: string): SafetyFinding[] {
    const out: SafetyFinding[] = [];
    const err = (check: string, message: string) =>
      out.push({ severity: FindingSeverity.ERROR, check, location: loc, message });
    switch (t.kind) {
      case ToleranceKind.AT_MOST:
      case ToleranceKind.AT_LEAST:
        if (t.threshold === undefined || !Number.isFinite(t.threshold)) {
          err('tolerance.threshold', `${t.kind} requires a finite threshold`);
        }
        break;
      case ToleranceKind.WITHIN_ABSOLUTE:
        if (t.absoluteDelta === undefined || t.absoluteDelta < 0) {
          err('tolerance.delta', 'WITHIN_ABSOLUTE requires absoluteDelta ≥ 0');
        }
        break;
      case ToleranceKind.WITHIN_PERCENT:
        if (t.percent === undefined || t.percent < 0 || t.percent > 1) {
          err('tolerance.percent', 'WITHIN_PERCENT requires percent in [0, 1]');
        }
        break;
      case ToleranceKind.IN_RANGE:
        if (t.min === undefined || t.max === undefined) {
          err('tolerance.range', 'IN_RANGE requires min and max');
        } else if (t.min > t.max) {
          err('tolerance.range', `IN_RANGE min ${t.min} > max ${t.max}`);
        }
        break;
    }
    return out;
  }

  private _checkTiming(def: ChaosExperimentDefinition): SafetyFinding[] {
    const out: SafetyFinding[] = [];
    const cfg = this._config;
    if (def.durationMs <= 0) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'timing.duration',
        location: 'durationMs',
        message: `durationMs ${def.durationMs} must be positive`,
      });
    }
    if (def.durationMs > cfg.maxDurationMs) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'timing.duration-max',
        location: 'durationMs',
        message: `durationMs ${def.durationMs} exceeds max ${cfg.maxDurationMs}`,
      });
    }
    if (def.warmupMs !== undefined && def.warmupMs < 0) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'timing.warmup',
        location: 'warmupMs',
        message: 'warmupMs must be non-negative',
      });
    }
    const total = (def.warmupMs ?? 0) + def.durationMs;
    if (total > cfg.maxTotalMs) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'timing.total',
        location: 'durationMs',
        message: `warmup+duration ${total}ms exceeds total cap ${cfg.maxTotalMs}ms`,
      });
    }
    if (def.minConfidence !== undefined && (def.minConfidence <= 0 || def.minConfidence > 1)) {
      out.push({
        severity: FindingSeverity.ERROR,
        check: 'timing.confidence',
        location: 'minConfidence',
        message: `minConfidence ${def.minConfidence} outside (0, 1]`,
      });
    }
    return out;
  }

  private _checkWindows(intendedStartMs: number): SafetyFinding[] {
    const out: SafetyFinding[] = [];
    let hasAllowWindow = false;
    let insideAllow = false;
    for (const w of this._config.safetyWindows) {
      const inside = intendedStartMs >= w.startsAt && intendedStartMs < w.endsAt;
      if (inside && w.blackout) {
        out.push({
          severity: FindingSeverity.ERROR,
          check: 'window.blackout',
          location: `safetyWindows['${w.name}']`,
          message:
            `start ${intendedStartMs} falls inside blackout '${w.name}' ` +
            `[${w.startsAt}, ${w.endsAt})`,
        });
      }
      if (!w.blackout) {
        hasAllowWindow = true;
        if (inside) insideAllow = true;
      }
    }
    // If any allow-windows exist, the start must fall inside at least one.
    if (hasAllowWindow && !insideAllow) {
      out.push({
        severity: FindingSeverity.WARNING,
        check: 'window.whitelist',
        location: 'safetyWindows',
        message: `start ${intendedStartMs} outside all allowed windows`,
      });
    }
    return out;
  }
}
