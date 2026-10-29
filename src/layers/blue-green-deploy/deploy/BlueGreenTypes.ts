/**
 * Blue-Green Deploy — Engine Types
 *
 * Types for the blue/green deployment orchestrator: environment descriptors,
 * deployment lifecycle states, traffic-split configuration, health gates,
 * smoke tests and rollback triggers.
 *
 * @module BlueGreenDeploy/Deploy
 */

/** Injectable clock — epoch ms. */
export type BgClock = () => number;

/** Which color environment. */
export enum EnvColor {
  BLUE = 'blue',
  GREEN = 'green',
}

/** Lifecycle of one environment slot. */
export enum EnvState {
  /** Not provisioned / empty. */
  EMPTY = 'EMPTY',
  /** Receiving the new artifact, warming up. */
  PROVISIONING = 'PROVISIONING',
  /** Passed smoke tests, ready to serve. */
  READY = 'READY',
  /** Serving production traffic. */
  LIVE = 'LIVE',
  /** Draining in-flight requests after losing traffic. */
  DRAINING = 'DRAINING',
  /** Decommissioned; safe to reuse for the next release. */
  RETIRED = 'RETIRED',
}

export const ENV_TRANSITIONS: Readonly<Record<EnvState, ReadonlyArray<EnvState>>> = {
  [EnvState.EMPTY]: [EnvState.PROVISIONING],
  [EnvState.PROVISIONING]: [EnvState.READY, EnvState.EMPTY, EnvState.RETIRED],
  [EnvState.READY]: [EnvState.LIVE, EnvState.RETIRED, EnvState.EMPTY],
  [EnvState.LIVE]: [EnvState.DRAINING],
  [EnvState.DRAINING]: [EnvState.RETIRED],
  [EnvState.RETIRED]: [EnvState.EMPTY],
};

/** Per-environment deployment record. */
export interface Environment {
  readonly color: EnvColor;
  state: EnvState;
  /** Artifact version deployed in this slot (e.g. 'v1.4.2', image digest). */
  version: string | null;
  /** Health score in [0,1] reported by the health gate. */
  healthScore: number;
  /** In-flight request count used by the drainer. */
  inFlight: number;
  /** Last health-check epoch ms. */
  lastHealthCheckAt: number;
}

/**
 * Traffic split: `greenPercent` of requests go to GREEN, the rest to BLUE.
 * Always in [0,100].
 */
export interface TrafficSplit {
  readonly greenPercent: number;
}

/** A step in a gradual traffic-shift plan. */
export interface TrafficStep {
  readonly greenPercent: number;
  /** Dwell time at this step before advancing (ms). */
  readonly dwellMs: number;
}

/**
 * Health gate evaluated before (and during) traffic shifts. All registered
 * probes must pass for the gate to open.
 */
export interface HealthProbe {
  readonly name: string;
  /** Returns a health score in [0,1]. */
  readonly check: (env: EnvColor, version: string) => number | Promise<number>;
  /** Minimum acceptable score (default 0.5). */
  readonly minScore?: number;
}

/** Smoke test run against a READY environment before it can go LIVE. */
export interface SmokeTest {
  readonly name: string;
  /** Throw or return false to fail the test. */
  readonly run: (env: EnvColor, version: string) => boolean | Promise<boolean>;
  /** When true, failure aborts the deployment; when false, it only warns. */
  readonly required: boolean;
}

export interface SmokeTestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly required: boolean;
  readonly durationMs: number;
  readonly error?: string;
}

/**
 * Automatic rollback trigger: when error rate on the live environment
 * exceeds `errorRateThreshold` inside `windowMs`, roll traffic back.
 */
export interface RollbackTrigger {
  readonly errorRateThreshold: number;
  readonly latencyP99ThresholdMs?: number;
  readonly windowMs: number;
  /** Minimum in-window observations before the trigger can fire. */
  readonly minSamples?: number;
}

/** Deployment-level orchestration states. */
export enum DeploymentState {
  IDLE = 'IDLE',
  PROVISIONING = 'PROVISIONING',
  SMOKE_TESTING = 'SMOKE_TESTING',
  HEALTH_GATING = 'HEALTH_GATING',
  SHIFTING = 'SHIFTING',
  DRAINING = 'DRAINING',
  COMPLETE = 'COMPLETE',
  ROLLING_BACK = 'ROLLING_BACK',
  ROLLED_BACK = 'ROLLED_BACK',
  FAILED = 'FAILED',
}

export const DEPLOYMENT_TRANSITIONS: Readonly<Record<DeploymentState, ReadonlyArray<DeploymentState>>> = {
  [DeploymentState.IDLE]: [DeploymentState.PROVISIONING],
  [DeploymentState.PROVISIONING]: [DeploymentState.SMOKE_TESTING, DeploymentState.FAILED],
  [DeploymentState.SMOKE_TESTING]: [DeploymentState.HEALTH_GATING, DeploymentState.FAILED],
  [DeploymentState.HEALTH_GATING]: [DeploymentState.SHIFTING, DeploymentState.FAILED],
  [DeploymentState.SHIFTING]: [DeploymentState.DRAINING, DeploymentState.ROLLING_BACK],
  [DeploymentState.DRAINING]: [DeploymentState.COMPLETE, DeploymentState.ROLLING_BACK],
  [DeploymentState.COMPLETE]: [],
  [DeploymentState.ROLLING_BACK]: [DeploymentState.ROLLED_BACK, DeploymentState.FAILED],
  [DeploymentState.ROLLED_BACK]: [],
  [DeploymentState.FAILED]: [],
};

export interface DeploymentRecord {
  readonly deploymentId: string;
  readonly version: string;
  readonly targetEnv: EnvColor;
  readonly transitions: ReadonlyArray<{ from: DeploymentState; to: DeploymentState; at: number; reason: string }>;
  readonly smokeResults: ReadonlyArray<SmokeTestResult>;
  readonly finalState: DeploymentState;
  readonly rolledBack: boolean;
  readonly startedAt: number;
  readonly finishedAt: number;
}
