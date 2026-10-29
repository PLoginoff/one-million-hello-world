/**
 * Disaster Recovery — DR Engine Types
 *
 * Shared types for the DR subsystem: recovery objectives (RTO/RPO), failover
 * state machine, backup artifacts, replication topology, corruption detection
 * and drill scoring.
 *
 * @module DisasterRecovery/DR
 */

/** Injectable clock — epoch ms. */
export type DrClock = () => number;

/** Deterministic random source in [0,1) for simulated faults/latency. */
export type DrRandom = () => number;

/**
 * Recovery objectives for a protected service/dataset.
 *
 * - RTO (Recovery Time Objective): maximum tolerable wall-clock time from
 *   disaster declaration to service restored.
 * - RPO (Recovery Point Objective): maximum tolerable data loss measured as
 *   the age of the newest recoverable committed transaction at failover time.
 */
export interface RecoveryObjective {
  readonly serviceId: string;
  /** Target RTO in ms. */
  readonly rtoMs: number;
  /** Target RPO in ms (max age of the recovery point). */
  readonly rpoMs: number;
  /** Percentage of objective at which a WARNING is raised (default 0.8). */
  readonly warningFraction?: number;
}

export enum ObjectiveStatus {
  MET = 'MET',
  WARNING = 'WARNING',
  BREACHED = 'BREACHED',
}

export interface ObjectiveMeasurement {
  readonly serviceId: string;
  readonly objective: 'RTO' | 'RPO';
  readonly measuredMs: number;
  readonly targetMs: number;
  readonly status: ObjectiveStatus;
  readonly measuredAt: number;
}

/** A node in the replication topology. */
export interface DrNode {
  readonly nodeId: string;
  readonly region: string;
  /** Current replication position — opaque monotone sequence (LSN/offset). */
  position: bigint;
  /** Last position durably applied (visible for reads). */
  appliedPosition: bigint;
  /** Wall-clock time of the node's last write (drives lag measurement). */
  lastWriteAt: number;
  /** Whether the node can participate in quorum votes / serve traffic. */
  healthy: boolean;
}

/**
 * Failover lifecycle states.
 *
 *   HEALTHY → DEGRADED → FAILOVER_INITIATED → QUORUM_CHECK →
 *   PROMOTING → REPOINTING → VERIFYING → FAILED_OVER → (RECOVERING → HEALTHY)
 *
 * ABORTED is reachable whenever a guard fails before FAILED_OVER.
 */
export enum FailoverState {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  FAILOVER_INITIATED = 'FAILOVER_INITIATED',
  QUORUM_CHECK = 'QUORUM_CHECK',
  PROMOTING = 'PROMOTING',
  REPOINTING = 'REPOINTING',
  VERIFYING = 'VERIFYING',
  FAILED_OVER = 'FAILED_OVER',
  RECOVERING = 'RECOVERING',
  ABORTED = 'ABORTED',
}

export const FAILOVER_TRANSITIONS: Readonly<Record<FailoverState, ReadonlyArray<FailoverState>>> = {
  [FailoverState.HEALTHY]: [FailoverState.DEGRADED, FailoverState.FAILOVER_INITIATED],
  [FailoverState.DEGRADED]: [FailoverState.FAILOVER_INITIATED, FailoverState.HEALTHY],
  [FailoverState.FAILOVER_INITIATED]: [FailoverState.QUORUM_CHECK, FailoverState.ABORTED],
  [FailoverState.QUORUM_CHECK]: [FailoverState.PROMOTING, FailoverState.ABORTED],
  [FailoverState.PROMOTING]: [FailoverState.REPOINTING, FailoverState.ABORTED],
  [FailoverState.REPOINTING]: [FailoverState.VERIFYING, FailoverState.ABORTED],
  [FailoverState.VERIFYING]: [FailoverState.FAILED_OVER, FailoverState.ABORTED],
  [FailoverState.FAILED_OVER]: [FailoverState.RECOVERING],
  [FailoverState.RECOVERING]: [FailoverState.HEALTHY, FailoverState.DEGRADED],
  [FailoverState.ABORTED]: [FailoverState.HEALTHY],
};

export interface FailoverTransition {
  readonly from: FailoverState;
  readonly to: FailoverState;
  readonly at: number;
  readonly reason: string;
}

/** A stored backup artifact subject to verification. */
export interface BackupArtifact {
  readonly backupId: string;
  readonly serviceId: string;
  /** Position the backup captured (recovery point). */
  readonly position: bigint;
  readonly createdAt: number;
  readonly sizeBytes: number;
  /** Integrity digest of the payload (hex). */
  readonly checksum: string;
  /** Kind of checksum stored — decides verification algorithm. */
  readonly checksumKind: 'fnv1a' | 'sha256-sim';
  /** Opaque storage payload the verifier restores + re-hashes. */
  readonly payload: Uint8Array;
}

export interface BackupVerificationResult {
  readonly backupId: string;
  readonly verified: boolean;
  readonly expectedChecksum: string;
  readonly actualChecksum: string;
  readonly restoredBytes: number;
  readonly durationMs: number;
  readonly error?: string;
}

/** Replication-lag reading for one replica. */
export interface LagReading {
  readonly replicaId: string;
  /** Position distance primary−replica (units of the position domain). */
  readonly positionLag: bigint;
  /** Estimated time lag in ms (derived from replica apply rate). */
  readonly timeLagMs: number;
  readonly measuredAt: number;
  readonly withinRpo: boolean;
}

/** Result of a corruption scan over a data page/segment. */
export interface CorruptionFinding {
  readonly segmentId: string;
  readonly corrupt: boolean;
  readonly expectedChecksum: string;
  readonly actualChecksum: string;
  readonly firstMismatchOffset?: number;
  readonly scannedAt: number;
}

/** A single scored drill step. */
export interface DrillStepResult {
  readonly step: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly detail: string;
}

export interface DrillReport {
  readonly drillId: string;
  readonly serviceId: string;
  readonly steps: ReadonlyArray<DrillStepResult>;
  /** 0..1 weighted score. */
  readonly score: number;
  readonly rtoMeasuredMs: number;
  readonly rpoMeasuredMs: number;
  readonly rtoMet: boolean;
  readonly rpoMet: boolean;
  readonly startedAt: number;
  readonly finishedAt: number;
}
