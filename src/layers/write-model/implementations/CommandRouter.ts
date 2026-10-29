/**
 * CommandRouter — declarative command → aggregate method binding.
 *
 * Where the repository is concerned with persistence, the router is
 * concerned with *dispatch*: given a `{type, payload}` command, which
 * aggregate does it target and which method should run?
 *
 * Each `Route` declares:
 *   - `commandType`   — the discriminator to match
 *   - `aggregateIdOf` — extract the target aggregate id from the payload
 *   - `create`        — factory for commands that create new aggregates
 *   - `invoke`        — call the domain method
 *
 * Routing modes:
 *   - EXISTING: load the aggregate; fail if it doesn't exist
 *   - CREATE:   start a fresh aggregate; fail if it already exists
 *   - UPSERT:   load-or-create (idempotent command semantics)
 *
 * The router returns a `RouteOutcome` capturing emitted events, old/new
 * version, and elapsed time. Concurrency conflicts surface as
 * `ConcurrencyError` — callers can `routeWithRetry` for automatic retry.
 *
 * @module WriteModelLayer/Implementations
 */

import { AggregateRoot, DomainEvent } from './AggregateRoot';
import { AggregateRepository } from './AggregateRepository';
import { ConcurrencyError } from './EventStorage';

// ------------------------------------------------------------------ types

export interface WriteCommand<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly correlationId?: string;
  readonly metadata?: Record<string, unknown>;
}

export type RouteMode = 'existing' | 'create' | 'upsert';

export interface Route<TAggregate extends AggregateRoot, TCommand extends WriteCommand = WriteCommand> {
  readonly commandType: string;
  readonly mode: RouteMode;
  /** Extract the target aggregate id from the command payload. */
  readonly aggregateIdOf: (command: TCommand) => string;
  /** Invoke the domain method; the aggregate emits events internally. */
  readonly invoke: (aggregate: TAggregate, command: TCommand) => void | Promise<void>;
}

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoutingError';
  }
}

export interface RouteOutcome {
  readonly commandType: string;
  readonly aggregateId: string;
  /** Version before save (0 for a new aggregate). */
  readonly previousVersion: number;
  /** Version after save. */
  readonly newVersion: number;
  readonly emittedEvents: readonly DomainEvent[];
  readonly elapsedMs: number;
  /** True iff the command produced no events (idempotent no-op). */
  readonly noOp: boolean;
}

// ------------------------------------------------------------------ router

export class CommandRouter<TAggregate extends AggregateRoot> {
  private readonly _repository: AggregateRepository<TAggregate>;
  private readonly _routes = new Map<string, Route<TAggregate>>();

  constructor(repository: AggregateRepository<TAggregate>) {
    this._repository = repository;
  }

  /** Register a route. */
  add(route: Route<TAggregate>): this {
    if (this._routes.has(route.commandType)) {
      throw new RoutingError(`Route already registered for '${route.commandType}'`);
    }
    this._routes.set(route.commandType, route);
    return this;
  }

  /** True iff a route exists for a command type. */
  handles(commandType: string): boolean {
    return this._routes.has(commandType);
  }

  /** Registered command types. */
  handledTypes(): string[] {
    return [...this._routes.keys()];
  }

  /**
   * Route a command: resolve aggregate, invoke, save, return outcome.
   *
   * Mode semantics:
   *   - existing → aggregate must exist (RoutingError otherwise)
   *   - create   → aggregate must NOT exist (RoutingError otherwise)
   *   - upsert   → load or start fresh
   */
  async route(command: WriteCommand): Promise<RouteOutcome> {
    const start = Date.now();
    const r = this._routes.get(command.type);
    if (!r) {
      throw new RoutingError(`No route for command '${command.type}'`);
    }

    const aggregateId = r.aggregateIdOf(command as WriteCommand);
    const exists = this._repository.exists(aggregateId);

    if (r.mode === 'existing' && !exists) {
      throw new RoutingError(
        `Command '${command.type}' targets missing aggregate '${aggregateId}'`,
      );
    }
    if (r.mode === 'create' && exists) {
      throw new RoutingError(
        `Command '${command.type}' targets existing aggregate '${aggregateId}'`,
      );
    }

    const aggregate = exists
      ? ((await this._repository.load(aggregateId)) as TAggregate)
      : await this._repository.loadOrCreate(aggregateId);

    const previousVersion = aggregate.version;
    await r.invoke(aggregate, command as WriteCommand);

    // Capture emitted events BEFORE save() — save() drains them.
    const emitted: readonly DomainEvent[] = [...aggregate.pendingEvents];
    if (emitted.length === 0) {
      return {
        commandType: command.type,
        aggregateId,
        previousVersion,
        newVersion: aggregate.version,
        emittedEvents: [],
        elapsedMs: Date.now() - start,
        noOp: true,
      };
    }

    const newVersion = await this._repository.save(aggregate, {
      correlationId: command.correlationId,
      ...command.metadata,
    });

    return {
      commandType: command.type,
      aggregateId,
      previousVersion,
      newVersion,
      emittedEvents: emitted, // captured before save() drained them
      elapsedMs: Date.now() - start,
      noOp: false,
    };
  }

  /**
   * Retry on ConcurrencyError — reload + re-invoke up to `maxAttempts`.
   * Safe for deterministic command handlers (the usual case).
   */
  async routeWithRetry(command: WriteCommand, maxAttempts = 3): Promise<RouteOutcome> {
    let lastError: Error | undefined;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await this.route(command);
      } catch (e) {
        if (e instanceof ConcurrencyError) {
          lastError = e;
          continue;
        }
        throw e;
      }
    }
    throw lastError ?? new RoutingError('routeWithRetry exhausted attempts');
  }
}
