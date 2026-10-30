/**
 * ProjectionEngine — events → read models, with durable checkpoints.
 *
 * A projection folds events into a queryable state (a "read model" in
 * CQRS). Two modes:
 *
 *   - `runOnce`   — fold every event in a range (rebuild from scratch is
 *                   just `runOnce` from position 0 into a fresh state).
 *   - `catchUp`   — continue from the projection's checkpoint, advancing
 *                   it as events apply. Checkpoints make restarts safe:
 *                   a projection never re-applies committed work.
 *
 * Fault semantics: a handler throwing mid-batch leaves the checkpoint at
 * the last successfully applied event (not the batch start) — exactly-once
 * would need transactional state+checkpoint, which in-memory state can't
 * provide; at-least-once + idempotent handlers is the honest contract.
 *
 * @module EventLayer/Engine
 */

import { EventLog } from './EventLog';
import { StoredEngineEvent } from './types';
import { UpcasterRegistry } from './Upcasting';

/** Handler: apply one event to the read-model state. */
export type ProjectionHandler<S> = (state: S, event: StoredEngineEvent) => S | void;

export interface ProjectionDef<S> {
  readonly name: string;
  /** Initial state (fresh object — engine clones via factory call). */
  readonly init: () => S;
  /** type → handler. Events with no handler are skipped (position still advances). */
  readonly handlers: Record<string, ProjectionHandler<S>>;
  /** Optional filter — only these streams feed the projection. */
  readonly streamFilter?: (streamId: string) => boolean;
}

export interface ProjectionCheckpoint {
  readonly name: string;
  /** Global position AFTER the last applied event (-1 = nothing applied). */
  readonly position: number;
  readonly appliedCount: number;
  readonly updatedAt: number;
}

export class ProjectionEngine {
  private readonly defs = new Map<string, ProjectionDef<unknown>>();
  private readonly states = new Map<string, unknown>();
  private readonly checkpoints = new Map<string, ProjectionCheckpoint>();
  private readonly clock: () => number;

  constructor(
    private readonly log: EventLog,
    private readonly upcasters: UpcasterRegistry,
    options: { clock?: () => number } = {}
  ) {
    this.clock = options.clock ?? Date.now;
  }

  /** Registers a projection definition. Re-registering replaces handlers. */
  register<S>(def: ProjectionDef<S>): this {
    this.defs.set(def.name, def as ProjectionDef<unknown>);
    if (!this.checkpoints.has(def.name)) {
      this.checkpoints.set(def.name, {
        name: def.name,
        position: -1,
        appliedCount: 0,
        updatedAt: this.clock(),
      });
    }
    if (!this.states.has(def.name)) {
      this.states.set(def.name, def.init());
    }
    return this;
  }

  names(): string[] {
    return [...this.defs.keys()];
  }

  unregister(name: string): boolean {
    this.states.delete(name);
    this.checkpoints.delete(name);
    return this.defs.delete(name);
  }

  /** Current read-model state for `name` (typed by the caller). */
  state<S>(name: string): S {
    return this.states.get(name) as S;
  }

  checkpoint(name: string): ProjectionCheckpoint | null {
    return this.checkpoints.get(name) ?? null;
  }

  /**
   * Applies events in [from, to] to the projection, advancing the
   * checkpoint per event. Returns events actually applied (handled).
   */
  runOnce(name: string, from: number, to?: number): number {
    const def = this.mustGet(name);
    const events = this.log.readFrom(from, to === undefined ? undefined : to - from + 1);
    let applied = 0;
    for (const raw of events) {
      const event = this.upcasters.upcastEvent(raw);
      if (def.streamFilter && !def.streamFilter(event.streamId)) {
        this.advanceCheckpoint(name, event.globalPosition, false);
        continue;
      }
      const handler = def.handlers[event.type];
      let appliedEvent = false;
      if (handler) {
        const prev = this.states.get(name);
        const next = handler(prev, event);
        // `undefined` return = handler mutated state in place; otherwise use return.
        if (next !== undefined) this.states.set(name, next);
        applied++;
        appliedEvent = true;
      }
      this.advanceCheckpoint(name, event.globalPosition, appliedEvent);
    }
    return applied;
  }

  /** Continues from the checkpoint to the log tip. Returns applied count. */
  catchUp(name: string): number {
    const cp = this.mustGet(name) && this.checkpoints.get(name);
    if (!cp) return 0;
    return this.runOnce(name, cp.position + 1);
  }

  /**
   * Rebuilds the projection from position 0 into a FRESH state — the
   * replay-with-handler-re-registration path: `register` new handlers,
   * `reset`, `catchUp`.
   */
  reset(name: string): void {
    const def = this.mustGet(name);
    this.states.set(name, def.init());
    this.checkpoints.set(name, {
      name,
      position: -1,
      appliedCount: 0,
      updatedAt: this.clock(),
    });
  }

  private advanceCheckpoint(name: string, position: number, applied: boolean): void {
    const cp = this.checkpoints.get(name);
    if (!cp) return;
    this.checkpoints.set(name, {
      ...cp,
      position,
      appliedCount: cp.appliedCount + (applied ? 1 : 0),
      updatedAt: this.clock(),
    });
  }

  private mustGet(name: string): ProjectionDef<unknown> {
    const def = this.defs.get(name);
    if (!def) throw new Error(`Unknown projection "${name}"`);
    return def;
  }
}
