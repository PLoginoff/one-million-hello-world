/**
 * AggregateDispatcher — route commands to event-sourced aggregates.
 *
 * The dispatcher binds the bus-level `Command` to a domain-level
 * aggregate method. Its responsibilities:
 *   1. Load the target aggregate (by id, from a repository).
 *   2. Invoke the aggregate method via a registered command handler.
 *   3. Collect emitted uncommitted events.
 *   4. Persist the aggregate (optimistic concurrency via expected version).
 *   5. Return the emitted events + new version.
 *
 * This is deliberately decoupled from the write-model layer — the
 * dispatcher works against generic `AggregateStore` / `CommandRouter`
 * interfaces so it can be plugged into any aggregate implementation.
 *
 * Command routing is table-driven: each command type maps to a
 * `CommandRouterEntry` that knows how to extract the aggregate id, load
 * the aggregate (or create a new one), and invoke the right method.
 *
 * @module CqrsLayer/Implementations
 */

import { Command, CommandContext } from './CqrsCore';

// ------------------------------------------------------------------ types

/** An event emitted by an aggregate method. */
export interface EmittedEvent<TData = unknown> {
  readonly type: string;
  readonly data: TData;
}

/** Minimal aggregate contract the dispatcher relies on. */
export interface DispatchableAggregate {
  /** Aggregate identity. */
  readonly id: string;
  /** Current committed version (0 for a brand-new aggregate). */
  readonly version: number;
  /** Events raised since last save — drained by the repository. */
  readonly pendingEvents: readonly EmittedEvent[];
  /** Clear pending events after a successful save. */
  commitPending(): void;
}

/**
 * Aggregate persistence. `expectedVersion` is the version the aggregate
 * was loaded at; the store MUST reject the save if the stream has moved.
 */
export interface AggregateStore<TAggregate extends DispatchableAggregate = DispatchableAggregate> {
  load(aggregateType: string, id: string): Promise<TAggregate | undefined>;
  save(
    aggregateType: string,
    aggregate: TAggregate,
    expectedVersion: number,
  ): Promise<{ newVersion: number }>;
}

/**
 * Route table entry: how to turn a command into a method call.
 *
 * `load` is given the extracted aggregate id and should return the
 * aggregate to operate on. For create-style commands, it returns a fresh
 * (version 0) aggregate.
 */
export interface CommandRouterEntry<TAggregate extends DispatchableAggregate = DispatchableAggregate> {
  /** Aggregate category (stream prefix), e.g. 'account'. */
  readonly aggregateType: string;
  /** Extract the target aggregate id from the command payload. */
  readonly aggregateId: (command: Command) => string;
  /** Load or construct the target aggregate. */
  readonly load: (store: AggregateStore, id: string) => Promise<TAggregate>;
  /** Invoke the command on the aggregate; emits events internally. */
  readonly invoke: (aggregate: TAggregate, command: Command, context: CommandContext) => Promise<void> | void;
}

/** Dispatcher result for a successful command. */
export interface DispatchResult {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly newVersion: number;
  readonly emittedEvents: readonly EmittedEvent[];
}

/** Concurrency error bubbled from the store. */
export class AggregateConcurrencyError extends Error {
  readonly aggregateId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;
  constructor(id: string, expected: number, actual: number) {
    super(
      `Concurrency conflict on aggregate '${id}': expected v${expected}, actual v${actual}`,
    );
    this.name = 'AggregateConcurrencyError';
    this.aggregateId = id;
    this.expectedVersion = expected;
    this.actualVersion = actual;
  }
}

// ------------------------------------------------------------- dispatcher

export class AggregateDispatcher {
  private readonly _store: AggregateStore;
  private readonly _routes = new Map<string, CommandRouterEntry>();

  constructor(store: AggregateStore) {
    this._store = store;
  }

  /** Register a command → aggregate route. */
  route<TAggregate extends DispatchableAggregate>(
    commandType: string,
    entry: CommandRouterEntry<TAggregate>,
  ): this {
    if (this._routes.has(commandType)) {
      throw new Error(`Route already registered for '${commandType}'`);
    }
    // Type-erasure: routes are stored heterogeneously; each entry is
    // internally consistent because `load` produces the TAggregate that
    // `invoke` consumes.
    this._routes.set(commandType, entry as unknown as CommandRouterEntry);
    return this;
  }

  /** True iff a route exists for this command type. */
  hasRoute(commandType: string): boolean {
    return this._routes.has(commandType);
  }

  /**
   * Dispatch a command to an aggregate. Returns the emitted events and
   * the new committed version. Throws AggregateConcurrencyError on
   * version conflicts (the caller may reload + retry).
   */
  async dispatch(command: Command, context: CommandContext): Promise<DispatchResult> {
    const entry = this._routes.get(command.type);
    if (!entry) {
      throw new Error(`No route registered for command '${command.type}'`);
    }

    const id = entry.aggregateId(command);
    const aggregate = await entry.load(this._store, id);
    const loadedVersion = aggregate.version;

    await entry.invoke(aggregate, command, context);

    const events = aggregate.pendingEvents;
    if (events.length === 0) {
      // No events emitted — nothing to save. Return the loaded version.
      return {
        aggregateId: aggregate.id,
        aggregateType: entry.aggregateType,
        newVersion: aggregate.version,
        emittedEvents: [],
      };
    }

    const { newVersion } = await this._store.save(
      entry.aggregateType,
      aggregate,
      loadedVersion,
    );
    aggregate.commitPending();

    return {
      aggregateId: aggregate.id,
      aggregateType: entry.aggregateType,
      newVersion,
      emittedEvents: [...events],
    };
  }

  /**
   * Retry-aware dispatch — reloads the aggregate and re-invokes the
   * command on concurrency conflicts. Suitable for idempotent command
   * semantics where the method itself is deterministic.
   */
  async dispatchWithRetry(
    command: Command,
    context: CommandContext,
    maxAttempts = 3,
  ): Promise<DispatchResult> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.dispatch(command, context);
      } catch (e) {
        if (e instanceof AggregateConcurrencyError) {
          lastError = e;
          continue;
        }
        throw e;
      }
    }
    throw lastError ?? new Error('dispatchWithRetry exhausted');
  }
}
