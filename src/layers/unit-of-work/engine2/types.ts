/**
 * UnitOfWork Engine2 — Shared Types
 *
 * Second-generation unit-of-work primitives: nested transactions via
 * savepoints, a read-committed isolation model, hash-based dirty
 * tracking, lifecycle hooks, and wait-for-graph deadlock detection.
 *
 * @module UnitOfWorkLayer/Engine2
 */

/** Injectable clock for lock timeouts and hook timing. */
export interface UowClock2 {
  now(): number;
}

export class SystemUowClock2 implements UowClock2 {
  now(): number {
    return Date.now();
  }
}

/** Test clock with manual time control. */
export class ManualUowClock2 implements UowClock2 {
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

/** An entity tracked by a unit of work. */
export interface TrackedEntity {
  /** Stable identity — "Type#id". */
  readonly identity: string;
  /** The working copy mutated inside the unit of work. */
  current: Record<string, unknown>;
  /** Snapshot taken when the entity was loaded/registered. */
  readonly original: Record<string, unknown>;
}

/** A mutation discovered by change tracking. */
export interface TrackedChange {
  readonly identity: string;
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

/** Lifecycle hook points. */
export type HookPhase = 'beforeCommit' | 'afterCommit' | 'afterRollback';
