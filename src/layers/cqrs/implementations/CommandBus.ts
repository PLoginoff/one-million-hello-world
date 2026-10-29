/**
 * CommandBus — synchronous in-process command dispatch pipeline.
 *
 * A command bus is the write-side entry point of CQRS: every state change
 * request enters as a `Command`, is pushed through a middleware pipeline
 * (validation, logging, idempotency, conflict checks, transactions), and
 * terminates in exactly ONE registered `CommandHandler`. By definition a
 * command has a single handler; fan-out is an event concern.
 *
 * Pipeline shape (onion model):
 *
 *   dispatch → mw[0] → mw[1] → ... → mw[n-1] → handler → result
 *                ↑_____________________________|
 *                 unwind (post-processing)
 *
 * Registration is O(1) via a `Map<type, handler>`. Dispatch builds a chain
 * of n+1 closures — O(n) where n = middleware count (typically < 10), so
 * dispatch overhead is sub-microsecond against a real handler.
 *
 * Middleware may be registered:
 *  - globally: `use(fn)` applies to every command
 *  - per type: `useFor('account.open', fn)` applies only to that command
 *
 * Features:
 *  - Handler registry with duplicate-registration guard
 *  - Wildcard middleware ('*') and per-type middleware
 *  - Synchronous dispatch with async handlers; both supported
 *  - Built-in latency/throughput counters per command type
 *  - Idempotent replay detection (when keyed commands retry)
 *
 * @module CqrsLayer/Implementations
 */

import {
  BusResult,
  Command,
  CommandContext,
  CommandHandler,
  CommandContext as Ctx,
  MiddlewareFn,
  NextFn,
  createContext,
  invoke,
} from './CqrsCore';

// ------------------------------------------------------------------ errors

export class CommandRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandRegistrationError';
  }
}

export class NoHandlerError extends Error {
  constructor(commandType: string) {
    super(`No handler registered for command '${commandType}'`);
    this.name = 'NoHandlerError';
  }
}

// ------------------------------------------------------------ metric types

/** Rolling stats for one command type. */
export interface CommandTypeStats {
  readonly commandType: string;
  dispatchCount: number;
  successCount: number;
  failureCount: number;
  /** Total handler ms — divide by successCount for mean latency. */
  totalElapsedMs: number;
  /** Max single-handler latency. */
  maxElapsedMs: number;
  /** Most recent error message, if any. */
  lastError?: string;
  lastDispatchedAt?: number;
}

/** Options accepted by `dispatch`. */
export interface DispatchOptions {
  /** Caller-supplied context fields (userId, tenantId, correlationId, ...). */
  readonly context?: Partial<CommandContext>;
  /** If true, throws BusResult.error instead of returning {ok:false}. */
  readonly throwOnError?: boolean;
}

// -------------------------------------------------------------------- bus

export class CommandBus {
  private readonly _handlers = new Map<string, CommandHandler>();
  private readonly _middleware: MiddlewareFn[] = [];
  private readonly _typedMiddleware = new Map<string, MiddlewareFn[]>();
  private readonly _stats = new Map<string, CommandTypeStats>();
  private readonly _idempotency = new Map<string, { result: BusResult<unknown>; at: number }>();
  private readonly _idempotencyTtlMs: number;
  private _frozen = false;

  constructor(options: { idempotencyTtlMs?: number } = {}) {
    this._idempotencyTtlMs = options.idempotencyTtlMs ?? 60_000;
  }

  /**
   * Register a handler for a command type.
   *
   * @throws CommandRegistrationError if a handler already exists, or if the
   *         bus has been frozen (no registrations allowed after freeze()).
   */
  register<TCommand extends Command, TResult>(
    commandType: string,
    handler: CommandHandler<TCommand, TResult>,
  ): this {
    if (this._frozen) {
      throw new CommandRegistrationError('CommandBus is frozen; registration closed');
    }
    if (this._handlers.has(commandType)) {
      throw new CommandRegistrationError(
        `Duplicate handler for command '${commandType}'`,
      );
    }
    this._handlers.set(commandType, handler as CommandHandler);
    return this;
  }

  /** Idempotent variant: replaces an existing handler. */
  registerOrReplace<TCommand extends Command, TResult>(
    commandType: string,
    handler: CommandHandler<TCommand, TResult>,
  ): this {
    this._handlers.set(commandType, handler as CommandHandler);
    return this;
  }

  /** True iff a handler exists for `commandType`. */
  hasHandler(commandType: string): boolean {
    return this._handlers.has(commandType);
  }

  /** Enumerate registered command types. */
  registeredTypes(): string[] {
    return [...this._handlers.keys()];
  }

  /** Add global middleware (applies to every command). */
  use(fn: MiddlewareFn): this {
    this._middleware.push(fn);
    return this;
  }

  /**
   * Add middleware scoped to one command type. Runs AFTER global middleware,
   * in registration order.
   */
  useFor(commandType: string, fn: MiddlewareFn): this {
    let list = this._typedMiddleware.get(commandType);
    if (!list) {
      list = [];
      this._typedMiddleware.set(commandType, list);
    }
    list.push(fn);
    return this;
  }

  /** Seal the bus — subsequent register() calls throw. */
  freeze(): this {
    this._frozen = true;
    return this;
  }

  /**
   * Dispatch a command through the middleware pipeline to its handler.
   *
   * Resolution order:
   *   global middleware → typed middleware → handler
   *
   * Idempotency: if `command.idempotencyKey` was seen within the TTL window
   * the recorded result is replayed verbatim and the handler is NOT invoked.
   */
  async dispatch<T = unknown>(
    command: Command,
    options: DispatchOptions = {},
  ): Promise<BusResult<T>> {
    const context = createContext(options.context);

    // Idempotent replay — a retried command returns its first result.
    const replay = this._lookupIdempotent(command);
    if (replay) {
      return replay as BusResult<T>;
    }

    const handler = this._handlers.get(command.type);
    if (!handler) {
      const error = new NoHandlerError(command.type);
      this._record(command.type, 0, false, error);
      const result: BusResult<T> = {
        ok: false,
        error,
        elapsedMs: 0,
        context,
      };
      if (options.throwOnError) throw error;
      return result;
    }

    // Build the onion: [global..., typed..., handler].
    const chain: MiddlewareFn[] = [
      ...this._middleware,
      ...(this._typedMiddleware.get(command.type) ?? []),
    ];

    const terminal: NextFn = () => Promise.resolve(handler(command, context));

    // Fold middleware into a nested continuation — right-most wraps handler.
    let next = terminal;
    for (let i = chain.length - 1; i >= 0; i--) {
      const mw = chain[i];
      const inner = next;
      next = () => Promise.resolve(mw(command, context, inner));
    }

    const result = await invoke<T>(() => next() as Promise<T>, context);

    this._record(command.type, result.elapsedMs, result.ok, result.error);
    if (command.idempotencyKey && result.ok) {
      this._idempotency.set(command.idempotencyKey, { result: result as BusResult<unknown>, at: Date.now() });
    }

    if (!result.ok && options.throwOnError && result.error) {
      throw result.error;
    }
    return result;
  }

  /** Stats snapshot — Map is copied; callers cannot mutate internals. */
  stats(): ReadonlyMap<string, CommandTypeStats> {
    const copy = new Map<string, CommandTypeStats>();
    for (const [k, v] of this._stats) copy.set(k, { ...v });
    return copy;
  }

  /** Aggregate stats across all command types. */
  totals(): { dispatches: number; successes: number; failures: number; meanElapsedMs: number } {
    let dispatches = 0;
    let successes = 0;
    let failures = 0;
    let elapsed = 0;
    for (const s of this._stats.values()) {
      dispatches += s.dispatchCount;
      successes += s.successCount;
      failures += s.failureCount;
      elapsed += s.totalElapsedMs;
    }
    return {
      dispatches,
      successes,
      failures,
      meanElapsedMs: successes > 0 ? elapsed / successes : 0,
    };
  }

  /** Drop all stats + idempotency keys (test helper / cache flush). */
  resetStats(): void {
    this._stats.clear();
    this._idempotency.clear();
  }

  // ------------------------------------------------------------- internal

  private _lookupIdempotent(command: Command): BusResult<unknown> | undefined {
    if (!command.idempotencyKey) return undefined;
    const entry = this._idempotency.get(command.idempotencyKey);
    if (!entry) return undefined;
    if (Date.now() - entry.at > this._idempotencyTtlMs) {
      this._idempotency.delete(command.idempotencyKey);
      return undefined;
    }
    return entry.result;
  }

  private _record(type: string, elapsed: number, ok: boolean, error?: Error): void {
    let s = this._stats.get(type);
    if (!s) {
      s = {
        commandType: type,
        dispatchCount: 0,
        successCount: 0,
        failureCount: 0,
        totalElapsedMs: 0,
        maxElapsedMs: 0,
      };
      this._stats.set(type, s);
    }
    s.dispatchCount += 1;
    if (ok) {
      s.successCount += 1;
      s.totalElapsedMs += elapsed;
      if (elapsed > s.maxElapsedMs) s.maxElapsedMs = elapsed;
    } else {
      s.failureCount += 1;
      s.lastError = error?.message;
    }
    s.lastDispatchedAt = Date.now();
  }
}
