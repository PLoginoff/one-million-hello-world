/**
 * DisasterRecovery Engine2 — Shared Types
 *
 * Second-generation DR operations: measured RTO/RPO against declared
 * targets (failover drills tracked with a real timeline, not aspirational
 * numbers), automated drill scoring, primary-vs-replica consistency
 * verification by checksum, runbook step automation with checkpoints,
 * and a maturity scorecard that grades the whole programme.
 *
 * In-memory only; the injectable clock drives failover timelines and
 * replication lag.
 *
 * @module DisasterRecoveryLayer/Engine2
 */

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface DrClock2 {
  now(): number;
}

export class SystemDrClock2 implements DrClock2 {
  now(): number {
    return Date.now();
  }
}

export class ManualDrClock2 implements DrClock2 {
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
// RTO / RPO measurement
// ---------------------------------------------------------------------------

/**
 * A failover event's measured timeline. All times are clock values;
 * durations derive from them (never entered directly, so nothing can
 * be sandbagged).
 */
export interface FailoverEvent {
  /** When the outage/drill began (primary considered down). */
  readonly detectedAt: number;
  /** When the replica was promoted (writes resume). */
  readonly promotedAt: number;
  /** When traffic was confirmed flowing on the new primary (readiness). */
  readonly verifiedAt: number;
  /**
   * Replica lag at detection — the data-loss bound. A replica 400ms
   * behind can lose at most 400ms of acknowledged writes.
   */
  readonly replicaLagMs: number;
  /** True when this was a drill rather than a real failover. */
  readonly drill: boolean;
}

export interface ObjectiveTargets {
  /** Recovery Time Objective: max acceptable detected→verified ms. */
  readonly rtoMs: number;
  /** Recovery Point Objective: max acceptable replicaLagMs. */
  readonly rpoMs: number;
}

export interface ObjectiveResult {
  readonly event: FailoverEvent;
  /** promotedAt - detectedAt: time to writable. */
  readonly actualRtoMs: number;
  /** replicaLagMs: the data-loss bound. */
  readonly actualRpoMs: number;
  readonly rtoMet: boolean;
  readonly rpoMet: boolean;
  /** verifiedAt - detectedAt: full time-to-traffic. */
  readonly totalRecoveryMs: number;
}

// ---------------------------------------------------------------------------
// Consistency verification
// ---------------------------------------------------------------------------

/** A checksum'd bucket on one side of the replication pair. */
export interface BucketChecksum {
  /** Bucket label, e.g. a table, partition or key range. */
  readonly bucket: string;
  /** Order-independent content checksum, hex string. */
  readonly checksum: string;
  /** Rows/items counted in the bucket. */
  readonly count: number;
}

export interface ConsistencyDiff {
  readonly bucket: string;
  readonly side: 'missing-replica' | 'missing-primary' | 'checksum-mismatch' | 'count-mismatch' | 'ok';
  readonly primary?: BucketChecksum;
  readonly replica?: BucketChecksum;
}

export interface ConsistencyReport {
  readonly bucketsCompared: number;
  readonly matched: number;
  readonly diffs: readonly ConsistencyDiff[];
  /** True when every compared bucket matched exactly. */
  readonly consistent: boolean;
}

// ---------------------------------------------------------------------------
// Runbook automation
// ---------------------------------------------------------------------------

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface RunbookStep {
  readonly id: string;
  readonly name: string;
  /** The action; async so steps may wrap real work. Returns optional note. */
  run(ctx: RunbookContext): Promise<string | void> | string | void;
  /**
   * When true, a failure halts the runbook (checkpoint). When false a
   * failure marks the step failed but execution continues — for
   * advisory/informational steps.
   */
  readonly required: boolean;
  /** Steps that must be `done` before this one may start. */
  readonly dependsOn?: readonly string[];
}

export interface StepOutcome {
  readonly id: string;
  readonly status: StepStatus;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly note?: string;
  readonly error?: string;
  /** True when a checkpoint was recorded at completion. */
  readonly checkpointed: boolean;
}

export interface RunbookContext {
  /** Operator-visible log line emitted during a run. */
  log(message: string): void;
  /** Read a value a previous step published via `publish`. */
  read<T = unknown>(key: string): T | undefined;
  /** Publish a value for later steps. */
  publish(key: string, value: unknown): void;
}

export interface RunbookResult {
  readonly halted: boolean;
  /** Id of the step that halted the run, when halted. */
  readonly failedStep?: string;
  readonly outcomes: readonly StepOutcome[];
  /** All checkpoints taken, in order. */
  readonly checkpoints: ReadonlyArray<{ readonly stepId: string; readonly at: number }>;
  readonly completedAt: number;
}

// ---------------------------------------------------------------------------
// Maturity scoring
// ---------------------------------------------------------------------------

export interface MaturityInput {
  /** Recent objective results (failovers + drills). */
  readonly objectives: readonly ObjectiveResult[];
  /** Consistency reports. */
  readonly consistency: readonly ConsistencyReport[];
  /** Runbook results. */
  readonly runbooks: readonly RunbookResult[];
}

export type MaturityLevel = 0 | 1 | 2 | 3 | 4;

export interface MaturityScore {
  /** 0 ad-hoc → 4 proven-and-measured. */
  readonly level: MaturityLevel;
  readonly levelName: string;
  /** Subscores feeding the level. */
  readonly detail: {
    /** Share of events meeting both RTO and RPO. */
    readonly objectivePassRate: number;
    /** Share of consistency reports fully consistent. */
    readonly consistencyRate: number;
    /** Share of runbooks that completed unhalted. */
    readonly runbookPassRate: number;
    /** Evidence volume (total events+reports+runs). */
    readonly evidenceCount: number;
  };
  /** Human-readable gap to the next level. */
  readonly nextLevelNeeds: string;
}
