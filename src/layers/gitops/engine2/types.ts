/**
 * Engine2 shared types — predictive GitOps.
 *
 * engine2 sits above the `engines/` primitives (detect → reconcile →
 * health): it *learns from history* (which resources drift, how often),
 * *governs* syncs per namespace (auto vs approval), *plans* minimal
 * rollbacks, and detects the subtle drift class — secrets whose shape
 * survives while their values rotate.
 *
 * Reuses the core model from `../engines/types` (ResourceSpec, DriftReport,
 * DiffAction) — these are add-ons, not a parallel model.
 *
 * @module GitopsLayer/Engine2
 */

export { SystemClock, TestClock } from '../engines/types';
export type { IClock } from '../engines/types';
export type {
  ResourceSpec,
  DesiredRevision,
  DriftReport,
  ResourceDiff,
  FieldDiff,
} from '../engines/types';
export { DiffAction, resourceKey } from '../engines/types';

import { DiffAction } from '../engines/types';

/* ------------------------------------------------------------------ */
/* Drift prediction                                                    */
/* ------------------------------------------------------------------ */

/** One observed drift incident for a resource. */
export interface DriftObservation {
  readonly resourceKey: string;
  readonly at: number;
  /** Fields that drifted (dot paths). */
  readonly fields: readonly string[];
  /** What drift caused: out-of-band edit, controller rewrite, etc. */
  readonly cause?: string;
}

/** Per-resource drift proneness learned from history. */
export interface DriftProneness {
  readonly resourceKey: string;
  /** 0..1 probability this resource drifts in the next window. */
  readonly probability: number;
  /** Observed drifts / observed syncs basis. */
  readonly driftCount: number;
  readonly windowCount: number;
  /** Fields that drift most often (descending frequency). */
  readonly hotFields: readonly string[];
  /** Mean inter-drift interval ms — null when < 2 drifts seen. */
  readonly meanIntervalMs: number | null;
}

/* ------------------------------------------------------------------ */
/* Sync policy                                                         */
/* ------------------------------------------------------------------ */

export type SyncMode = 'auto' | 'manual' | 'auto-with-approval-window';

export interface NamespacePolicy {
  /** Glob-ish match: "prod-*", exact name, or "*" wildcard. */
  readonly namespace: string;
  readonly mode: SyncMode;
  /** For auto-with-approval-window: ms to wait before auto-applying. */
  readonly approvalWindowMs?: number;
  /** Extra constraint: max resources a single auto-sync may touch. */
  readonly maxAutoResources?: number;
}

export type SyncDecision =
  | { kind: 'auto' }
  | { kind: 'await-approval'; applyAfter: number | null }
  | { kind: 'blocked'; reason: string };

/* ------------------------------------------------------------------ */
/* Rollback planning                                                   */
/* ------------------------------------------------------------------ */

/** One atomic revert operation in a rollback plan. */
export interface RollbackStep {
  readonly resourceKey: string;
  readonly action: DiffAction;
  /**
   * For updates: the fields to revert (path → previous value). Only the
   * fields that changed since the target revision need reverting —
   * that's what makes the plan *minimal*.
   */
  readonly fieldRestores: readonly { path: string; value: unknown }[];
  readonly wave: number;
}

export interface RollbackPlan {
  readonly fromRevisionId: string;
  readonly toRevisionId: string;
  /** Steps in apply order — wave asc, deletes last within a wave. */
  readonly steps: readonly RollbackStep[];
  /** Fields touched — small means surgical. */
  readonly touchedFieldCount: number;
}

/* ------------------------------------------------------------------ */
/* Secret drift                                                        */
/* ------------------------------------------------------------------ */

export interface SecretDrift {
  readonly resourceKey: string;
  /** Keys whose values changed while the key set stayed identical. */
  readonly rotatedKeys: readonly string[];
  /** Keys only in desired — added secret entries. */
  readonly addedKeys: readonly string[];
  /** Keys only in live — leaked/removed entries. */
  readonly removedKeys: readonly string[];
}
