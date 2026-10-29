/**
 * ReadConsistency — eventual-consistency primitives for the read side.
 *
 * Problem: a client writes a command (write side applies position N), then
 * immediately issues a query. The read side may only have applied up to
 * position M < N — the query would return stale data. Solutions:
 *
 *   - waitForPosition(store, N, timeout): poll the projection's checkpoint
 *     until it reaches N — read-your-writes consistency
 *   - OptimisticDocument: a doc tagged with its producing position; the
 *     reader can detect when it's "too stale" relative to a known head
 *   - StaleReadDetector: wraps query results with staleness metadata
 *
 * These utilities are deliberately free-standing — the QueryEngine stays
 * pure and callers layer consistency on top.
 *
 * @module ReadModelLayer/Implementations
 */

import { ProjectionStore, StoredDocument } from './ProjectionStore';
import { ReadQueryEngine, ReadQuery, ReadResultPage } from './QueryEngine';
import { ProjectionUpdater } from './ProjectionUpdater';

// ------------------------------------------------------------------ types

/** A query result annotated with staleness information. */
export interface ConsistentPage<T> extends ReadResultPage<T> {
  /** Store applied position at query time. */
  readonly appliedPosition: number;
  /** Head position supplied by the caller (write-side). */
  readonly observedHead: number | undefined;
  /** True iff `observedHead > appliedPosition` — the read may be stale. */
  readonly potentiallyStale: boolean;
}

/** A single document tagged with staleness metadata. */
export interface OptimisticDocument<T> {
  readonly doc: StoredDocument<T>;
  /** Position of the event that produced this state. */
  readonly appliedPosition: number;
  /** True iff `appliedPosition` < a supplied head. */
  readonly stale: boolean;
  /** How many positions behind, if stale. */
  readonly lag: number;
}

// ------------------------------------------------------------------ wait

/**
 * Poll the store until `appliedPosition` >= `position`, or time out.
 * Resolution: poll every `intervalMs` — simple and portable.
 */
export async function waitForPosition(
  store: ProjectionStore,
  position: number,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeout = options.timeoutMs ?? 10_000;
  const interval = options.intervalMs ?? 10;
  const deadline = Date.now() + timeout;
  while (Date.now() <= deadline) {
    if (store.appliedPosition >= position) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return store.appliedPosition >= position;
}

/**
 * Wait until a specific projection's checkpoint reaches `position`.
 * Use this when the store-level position is not fine-grained enough.
 */
export async function waitForProjection(
  updater: ProjectionUpdater,
  projectionName: string,
  position: number,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeout = options.timeoutMs ?? 10_000;
  const interval = options.intervalMs ?? 10;
  const deadline = Date.now() + timeout;
  while (Date.now() <= deadline) {
    if (updater.checkpoint(projectionName) >= position) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return updater.checkpoint(projectionName) >= position;
}

// ---------------------------------------------------------- stale reads

/**
 * Wraps a query with staleness metadata. `observedHead` is the position
 * the caller knows the write side has reached (e.g. from a command
 * response); when supplied, `potentiallyStale` tells the caller whether
 * the result may lag.
 */
export function queryConsistent<T = Record<string, unknown>>(
  engine: ReadQueryEngine,
  store: ProjectionStore,
  q: ReadQuery,
  observedHead?: number,
): ConsistentPage<T> {
  const page = engine.query<T>(q);
  const applied = store.appliedPosition;
  return {
    ...page,
    appliedPosition: applied,
    observedHead,
    potentiallyStale: observedHead !== undefined && observedHead > applied,
  };
}

/**
 * Annotate a document with staleness relative to a head position.
 * `lag` = how many positions behind the head this doc's producing event was.
 */
export function asOptimistic<T>(
  doc: StoredDocument<T>,
  headPosition: number,
): OptimisticDocument<T> {
  const lag = Math.max(0, headPosition - doc.appliedPosition);
  return {
    doc,
    appliedPosition: doc.appliedPosition,
    stale: lag > 0,
    lag,
  };
}

// ----------------------------------------------------- consistency policy

/**
 * A consistency policy a caller can enforce before returning a result.
 *
 *   STRONG:       throw if stale — caller must retry or block
 *   BOUNDED(ms):  accept if last update was within `maxStalenessMs`
 *   POSITIONED:   accept iff doc.appliedPosition >= requiredPosition
 *   EVENTUAL:     always accept (no guarantee)
 */
export type ConsistencyPolicy =
  | { kind: 'strong' }
  | { kind: 'bounded'; maxStalenessMs: number }
  | { kind: 'positioned'; requiredPosition: number }
  | { kind: 'eventual' };

export class StaleReadError extends Error {
  readonly policy: ConsistencyPolicy;
  readonly appliedPosition: number;
  constructor(policy: ConsistencyPolicy, appliedPosition: number) {
    super(`Read does not satisfy consistency policy ${policy.kind} (applied=${appliedPosition})`);
    this.name = 'StaleReadError';
    this.policy = policy;
    this.appliedPosition = appliedPosition;
  }
}

/**
 * Enforce a policy against a document. Throws StaleReadError on violation;
 * returns the doc unchanged on success.
 */
export function enforcePolicy<T>(
  doc: StoredDocument<T>,
  policy: ConsistencyPolicy,
  observedHead?: number,
): StoredDocument<T> {
  switch (policy.kind) {
    case 'eventual':
      return doc;
    case 'strong': {
      // "Strong" here means: doc is at the supplied head. If no head is
      // provided we can't prove freshness — treat as violation.
      if (observedHead === undefined || doc.appliedPosition < observedHead) {
        throw new StaleReadError(policy, doc.appliedPosition);
      }
      return doc;
    }
    case 'bounded': {
      const age = Date.now() - doc.updatedAt;
      if (age > policy.maxStalenessMs) {
        throw new StaleReadError(policy, doc.appliedPosition);
      }
      return doc;
    }
    case 'positioned': {
      if (doc.appliedPosition < policy.requiredPosition) {
        throw new StaleReadError(policy, doc.appliedPosition);
      }
      return doc;
    }
  }
}
