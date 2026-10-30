/**
 * BlueGreenDeploy Engine2 — Shared Types
 *
 * Second-generation blue/green operations: multi-service wave planning
 * from a dependency graph, environment-parity checking between the blue
 * and green stacks, a post-switch smoke-test suite, error-rate traffic
 * analysis during the cutover window, and instant rollback with
 * state-restore tracking.
 *
 * In-memory, transport-agnostic; the injectable clock drives windows
 * and switch timelines.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface BgClock2 {
  now(): number;
}

export class SystemBgClock2 implements BgClock2 {
  now(): number {
    return Date.now();
  }
}

export class ManualBgClock2 implements BgClock2 {
  private _t: number;
  constructor(start: number = 0) {
    this._t = start;
  }
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

// ---------------------------------------------------------------------------
// Wave planning
// ---------------------------------------------------------------------------

export interface ServiceNode {
  readonly name: string;
  /**
   * Services this one calls at runtime — it must deploy AFTER them so a
   * new version never hits an old, incompatible dependency.
   */
  readonly dependsOn: readonly string[];
}

export interface DeploymentWave {
  /** Services that may deploy concurrently inside this wave. */
  readonly services: readonly string[];
}

export interface WavePlan {
  readonly waves: readonly DeploymentWave[];
  /**
   * Deploy order when executed sequentially: `indexOf(service)` is its
   * position; dependents always sort after their dependencies.
   */
  readonly order: readonly string[];
  /** Services unreachable from the declared graph (cycles reported separately). */
  readonly cyclic: readonly string[];
}

// ---------------------------------------------------------------------------
// Environment parity
// ---------------------------------------------------------------------------

export interface EnvVarEntry {
  readonly key: string;
  /** Non-secret values carry their literal; secrets carry `hash` instead. */
  readonly value?: string;
  /** Opaque fingerprint for comparing secrets without exposing them. */
  readonly hash?: string;
  readonly secret: boolean;
}

export type ParityIssueKind = 'missing-in-green' | 'missing-in-blue' | 'value-differs' | 'hash-differs';

export interface ParityIssue {
  readonly key: string;
  readonly kind: ParityIssueKind;
  /** Literal diff only for non-secret keys. */
  readonly blueValue?: string;
  readonly greenValue?: string;
}

export interface ParityReport {
  readonly ok: boolean;
  readonly comparedKeys: number;
  readonly issues: readonly ParityIssue[];
  /** Keys ignored per policy (wildcards like `*_COLOR` or `REVISION`). */
  readonly ignoredKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

export interface SmokeTest {
  readonly name: string;
  /** Executes the check; throw or return false to fail. Optional detail string. */
  run(): Promise<string | boolean | void> | string | boolean | void;
  /** Max wall-clock ms for this check; over = failure. */
  readonly timeoutMs?: number;
  /** Failure aborts the suite (default true). */
  readonly required?: boolean;
}

export interface SmokeResult {
  readonly name: string;
  readonly ok: boolean;
  readonly durationMs: number;
  readonly detail?: string;
  readonly error?: string;
  /** True when the check exceeded its timeoutMs. */
  readonly timedOut: boolean;
}

export interface SmokeReport {
  readonly ok: boolean;
  readonly results: readonly SmokeResult[];
  /** True when a required check failed and the suite aborted early. */
  readonly aborted: boolean;
}

// ---------------------------------------------------------------------------
// Traffic analysis during switch
// ---------------------------------------------------------------------------

export interface TrafficWindow {
  readonly requests: number;
  readonly errors: number;
}

export interface TrafficComparison {
  readonly blue: TrafficWindow & { readonly errorRate: number };
  readonly green: TrafficWindow & { readonly errorRate: number };
  /** green.rate - blue.rate (percentage-point delta). */
  readonly errorRateDelta: number;
  /**
   * Lift ratio green/blue; null when blue rate is 0 (green>0 → Infinity
   * reported as `Infinite` flag rather than a number).
   */
  readonly errorRateRatio: number | null;
  readonly greenWorse: boolean;
  readonly recommendation: 'stay' | 'rollback';
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

export interface ServiceStateSnapshot {
  readonly service: string;
  /** Opaque pre-switch state the environment restores (image tag, config blob). */
  readonly state: unknown;
  readonly capturedAt: number;
}

export interface RollbackStep {
  readonly service: string;
  readonly ok: boolean;
  readonly detail?: string;
  readonly error?: string;
}

export interface RollbackReport {
  readonly ok: boolean;
  readonly rolledBackAt: number;
  /** Services restored, in reverse-wave order (dependents first). */
  readonly steps: readonly RollbackStep[];
  /** Services whose restore failed — require manual action. */
  readonly manual: readonly string[];
}
