/**
 * Projection Engine
 *
 * Projections fold the event log into queryable read-models.
 * A `Projection` can run in two modes:
 * - **Live**: subscribed to the store; state updates as events commit
 * - **Rebuild**: replays the global log from position 0 (or a checkpoint)
 *
 * The engine tracks a per-projection checkpoint (last processed global
 * position) so rebuilds can be resumed incrementally.
 *
 * @module EventSourcingLayer/Implementations
 */

import { EventStore, StoredEvent, SubscriptionHandle } from './EventStore';

/**
 * The contract a read-model implements to be driven by the projection engine.
 *
 * `TState` is the materialized state held inside the projection.
 */
export interface IProjection<TState> {
  readonly name: string;
  /** Event types this projection cares about; `undefined` = all. */
  readonly eventTypes?: readonly string[];
  /** Produce the initial (empty) state. */
  initialState(): TState;
  /** Fold an event into `state`; must return the (possibly new) state. */
  fold(state: TState, event: StoredEvent): TState;
}

export interface ProjectionCheckpoint {
  readonly projectionName: string;
  readonly position: number;
  readonly updatedAt: number;
}

export interface ProjectionStatus {
  name: string;
  position: number;
  eventsProcessed: number;
  running: boolean;
  lastUpdatedAt: number | null;
}

/**
 * A running projection instance: holds state + checkpoint + optional live sub.
 */
export class ProjectionInstance<TState> {
  private _state: TState;
  private _position = -1;
  private _processed = 0;
  private _sub: SubscriptionHandle | null = null;
  private _lastUpdatedAt: number | null = null;

  constructor(
    private readonly _projection: IProjection<TState>,
    private readonly _store: EventStore
  ) {
    this._state = _projection.initialState();
  }

  get state(): TState {
    return this._state;
  }

  get name(): string {
    return this._projection.name;
  }

  get position(): number {
    return this._position;
  }

  /** Full rebuild: resets state and replays the log from `fromPosition`. */
  async rebuild(fromPosition = 0): Promise<number> {
    this.stop();
    this._state = this._projection.initialState();
    const filter = this._typeFilter();
    const count = await this._store.rebuildProjection(
      (e) => {
        this._apply(e);
      },
      { fromPosition, typeFilter: filter }
    );
    return count;
  }

  /**
   * Catch up to the current log tail and then stay live via subscription.
   */
  start(): void {
    this.stop();
    // Catch up first (sync replay up to tail), then subscribe live.
    const filter = this._typeFilter();
    const tail = this._store.readAll({ typeFilter: filter });
    for (const e of tail) {
      if (e.globalPosition > this._position) this._apply(e);
    }
    this._sub = this._store.subscribe((e) => this._apply(e), {
      fromPosition: this._position + 1,
      typeFilter: filter,
    });
  }

  /** Stop live updates (state is preserved). */
  stop(): void {
    if (this._sub) {
      this._sub.stop();
      this._sub = null;
    }
  }

  status(): ProjectionStatus {
    return {
      name: this.name,
      position: this._position,
      eventsProcessed: this._processed,
      running: this._sub !== null,
      lastUpdatedAt: this._lastUpdatedAt,
    };
  }

  checkpoint(): ProjectionCheckpoint {
    return {
      projectionName: this.name,
      position: this._position,
      updatedAt: this._lastUpdatedAt ?? Date.now(),
    };
  }

  /** Resume a projection from a prior checkpoint position. */
  async resumeFromCheckpoint(cp: ProjectionCheckpoint): Promise<void> {
    this._position = cp.position;
    await this.rebuild(cp.position + 1);
  }

  private _apply(e: StoredEvent): void {
    this._state = this._projection.fold(this._state, e);
    this._position = e.globalPosition;
    this._processed++;
    this._lastUpdatedAt = Date.now();
  }

  private _typeFilter(): ((t: string) => boolean) | undefined {
    const types = this._projection.eventTypes;
    if (!types || types.length === 0) return undefined;
    const set = new Set(types);
    return (t) => set.has(t);
  }
}

/**
 * Registry that manages a set of projections against a shared store.
 */
export class ProjectionManager {
  private readonly _instances = new Map<string, ProjectionInstance<unknown>>();
  private readonly _checkpoints = new Map<string, ProjectionCheckpoint>();

  constructor(private readonly _store: EventStore) {}

  register<TState>(projection: IProjection<TState>): ProjectionInstance<TState> {
    if (this._instances.has(projection.name)) {
      throw new Error(`Projection '${projection.name}' already registered`);
    }
    const inst = new ProjectionInstance(projection, this._store);
    this._instances.set(projection.name, inst as ProjectionInstance<unknown>);
    return inst;
  }

  get<TState>(name: string): ProjectionInstance<TState> | undefined {
    return this._instances.get(name) as ProjectionInstance<TState> | undefined;
  }

  async rebuildAll(): Promise<void> {
    for (const inst of this._instances.values()) {
      await inst.rebuild();
      this._checkpoints.set(inst.name, inst.checkpoint());
    }
  }

  startAll(): void {
    for (const inst of this._instances.values()) inst.start();
  }

  stopAll(): void {
    for (const inst of this._instances.values()) inst.stop();
  }

  saveCheckpoints(): ProjectionCheckpoint[] {
    const out: ProjectionCheckpoint[] = [];
    for (const inst of this._instances.values()) {
      const cp = inst.checkpoint();
      this._checkpoints.set(cp.projectionName, cp);
      out.push(cp);
    }
    return out;
  }

  checkpointFor(name: string): ProjectionCheckpoint | undefined {
    return this._checkpoints.get(name);
  }

  statuses(): ProjectionStatus[] {
    return [...this._instances.values()].map((i) => i.status());
  }
}
