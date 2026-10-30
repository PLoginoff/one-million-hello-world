/**
 * EventEngine — facade composing log + upcasters + projections + subs.
 *
 * Owns the append path (attaching correlation/causation envelope fields),
 * exposes the read paths with transparent upcasting, and offers `replay`
 * helpers for projection rebuilds and handler re-registration.
 *
 * @module EventLayer/Engine
 */

import { CatchUpSubscription, Subscription } from './CatchUpSubscription';
import { EventLog, EventLogOptions } from './EventLog';
import { ProjectionCheckpoint, ProjectionDef, ProjectionEngine } from './ProjectionEngine';
import { EngineEvent, EventEnvelopeMeta, StoredEngineEvent } from './types';
import { UpcasterRegistry } from './Upcasting';

export class EventEngine {
  readonly log: EventLog;
  readonly upcasters = new UpcasterRegistry();
  readonly projections: ProjectionEngine;
  readonly subscriptions: CatchUpSubscription;

  constructor(options: EventLogOptions = {}) {
    this.log = new EventLog(options);
    this.projections = new ProjectionEngine(this.log, this.upcasters, {
      clock: options.clock,
    });
    this.subscriptions = new CatchUpSubscription(this.log, this.upcasters);
  }

  /**
   * Appends events to a stream. `meta.correlationId`/`causationId` flow
   * through to every committed envelope — pass a `withMeta` helper result
   * to inherit correlation from a triggering event automatically.
   */
  emit(
    streamId: string,
    events: readonly EngineEvent[],
    expectedStreamPosition?: number,
    meta: EventEnvelopeMeta = {}
  ): StoredEngineEvent[] {
    const stamped = events.map((e) => ({ ...e, meta: { ...meta, ...e.meta } }));
    return this.log.append(streamId, stamped, expectedStreamPosition);
  }

  /**
   * Derives emit-metadata from a causing event: inherits its correlationId
   * (whole request chain shares it) and sets causationId to the event id.
   * This is the distributed-tracing convention for event-driven systems.
   */
  inheritMeta(causing: StoredEngineEvent): EventEnvelopeMeta {
    return {
      correlationId: causing.meta.correlationId ?? causing.id,
      causationId: causing.id,
    };
  }

  /** Reads a stream with upcasting applied. */
  readStream(streamId: string, from?: number, to?: number): StoredEngineEvent[] {
    return this.log.readStream(streamId, from, to).map((e) => this.upcasters.upcastEvent(e));
  }

  /** Reads the global log from a position with upcasting applied. */
  readAll(from = 0, limit?: number): StoredEngineEvent[] {
    return this.log.readFrom(from, limit).map((e) => this.upcasters.upcastEvent(e));
  }

  /**
   * Replays all committed events through `handler`, in order. The classic
   * use: rebuilding a read model after a code change, or hydrating
   * in-memory state on startup.
   */
  replay(
    handler: (event: StoredEngineEvent) => void,
    from = 0,
    filter?: (event: StoredEngineEvent) => boolean
  ): number {
    let n = 0;
    for (const raw of this.log.readFrom(from)) {
      const e = this.upcasters.upcastEvent(raw);
      if (filter && !filter(e)) continue;
      handler(e);
      n++;
    }
    return n;
  }

  /** Registers a projection and immediately catches it up. */
  registerProjection<S>(def: ProjectionDef<S>): this {
    this.projections.register(def);
    this.projections.catchUp(def.name);
    return this;
  }

  /**
   * Re-registers a projection's handlers and rebuilds its state by replay.
   * This is the "fix a projection bug" workflow: change handlers, replay
   * the log, checkpoint ends back at the tip.
   */
  rebuildProjection<S>(def: ProjectionDef<S>): this {
    this.projections.register(def); // replaces handlers
    this.projections.reset(def.name);
    this.projections.catchUp(def.name);
    return this;
  }

  projectionState<S>(name: string): S {
    return this.projections.state<S>(name);
  }

  projectionCheckpoint(name: string): ProjectionCheckpoint | null {
    return this.projections.checkpoint(name);
  }

  /** Catches all registered projections up to the tip. */
  catchUpProjections(): void {
    for (const name of this.projectionNames()) {
      this.projections.catchUp(name);
    }
  }

  projectionNames(): string[] {
    return this.projections.names();
  }

  subscribe(fromPosition = 0): Subscription {
    return this.subscriptions.subscribe(fromPosition);
  }

  // `Subscription` re-exported as `EngineSubscription` from './engine'.
}
