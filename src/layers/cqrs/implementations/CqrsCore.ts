/**
 * CQRS Core — command/query envelopes, results, and shared plumbing.
 *
 * This module defines the primitive vocabulary used by the command bus,
 * query bus, and middleware pipeline. Everything here is intentionally
 * transport-agnostic: a command is a plain object with a `type` string and
 * an optional payload; the bus never inspects payload shapes (that is the
 * job of validators and handlers).
 *
 * Design notes:
 * - `CommandContext` carries cross-cutting metadata (correlation id, user,
 *   tenant, causation chain). It is immutable once created; middleware that
 *   wants to "add" information returns a new context.
 * - `next()` in middleware is an explicit continuation — the onion model.
 *   Wrapping a handler N middleware deep costs O(N) closure allocations per
 *   dispatch, which is trivially cheap compared to the handler body.
 *
 * @module CqrsLayer/Implementations
 */

// ------------------------------------------------------------------- types

/** Opaque command input. A POJO with a mandatory discriminator. */
export interface Command<TPayload = unknown> {
  /** Discriminator, e.g. 'account.open'. Must be registered on the bus. */
  readonly type: string;
  /** Command payload — shape defined by the owning bounded context. */
  readonly payload: TPayload;
  /** Optional caller-supplied idempotency key. */
  readonly idempotencyKey?: string;
}

/** Opaque query input. Queries never mutate state. */
export interface Query<TParams = unknown> {
  /** Discriminator, e.g. 'account.byId'. */
  readonly type: string;
  /** Query parameters (filters, pagination hints, etc.). */
  readonly params: TParams;
}

/**
 * Per-dispatch context. `causationId` points at the message (command or
 * event) that caused this one; `correlationId` groups the whole saga.
 */
export interface CommandContext {
  /** Unique id for this dispatch. */
  readonly dispatchId: string;
  /** Correlates every message caused by the same original request. */
  readonly correlationId: string;
  /** The message id that directly caused this dispatch, if any. */
  readonly causationId?: string;
  /** Acting principal, if authenticated. */
  readonly userId?: string;
  /** Tenant discriminator for multi-tenant buses. */
  readonly tenantId?: string;
  /** Wall-clock dispatch time (epoch millis). */
  readonly timestamp: number;
  /** Free-form metadata bag for middleware-produced values. */
  readonly metadata: Record<string, unknown>;
}

/** Uniform bus result. `T` is the handler's return type. */
export interface BusResult<T = unknown> {
  /** Whether the handler completed without throwing / rejecting. */
  readonly ok: boolean;
  /** Handler return value (present iff `ok`). */
  readonly value?: T;
  /** Captured error (present iff !ok). */
  readonly error?: Error;
  /** Handler wall-clock time in milliseconds. */
  readonly elapsedMs: number;
  /** Context the command was executed under. */
  readonly context: CommandContext;
}

/** A command handler is a pure async function of (command, context). */
export type CommandHandler<TCommand extends Command = Command, TResult = unknown> = (
  command: TCommand,
  context: CommandContext,
) => Promise<TResult> | TResult;

/** A query handler is a pure async function of (query, context). */
export type QueryHandler<TQuery extends Query = Query, TResult = unknown> = (
  query: TQuery,
  context: CommandContext,
) => Promise<TResult> | TResult;

/** Continuation passed to middleware — invokes the next pipeline stage. */
export type NextFn<TResult = unknown> = () => Promise<TResult>;

/**
 * Middleware signature. May short-circuit (skip `next()`), may post-process
 * the result, may add context via `context.metadata` mutation. Middleware
 * runs in registration order for commands, reverse order unwinding.
 */
export type MiddlewareFn = (
  message: Command | Query,
  context: CommandContext,
  next: NextFn,
) => Promise<unknown>;

// --------------------------------------------------------------- factories

let _dispatchCounter = 0;

/**
 * Generate a unique dispatch id. Monotonic within a process (counter +
 * timestamp), unique across processes via a random suffix.
 */
export function nextDispatchId(): string {
  _dispatchCounter += 1;
  return `d-${Date.now().toString(36)}-${_dispatchCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Build a fresh context for a top-level dispatch. */
export function createContext(init: Partial<CommandContext> = {}): CommandContext {
  return {
    dispatchId: init.dispatchId ?? nextDispatchId(),
    correlationId: init.correlationId ?? `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    causationId: init.causationId,
    userId: init.userId,
    tenantId: init.tenantId,
    timestamp: init.timestamp ?? Date.now(),
    metadata: init.metadata ? { ...init.metadata } : {},
  };
}

/** Derive a child context (same correlation, this dispatch as causation). */
export function childContext(parent: CommandContext): CommandContext {
  return createContext({
    correlationId: parent.correlationId,
    causationId: parent.dispatchId,
    userId: parent.userId,
    tenantId: parent.tenantId,
    metadata: parent.metadata,
  });
}

// ----------------------------------------------------------------- helpers

/** Type guard: is `value` a Command-shaped object? */
export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['type'] === 'string' && v['type'].length > 0 && 'payload' in v;
}

/** Type guard: is `value` a Query-shaped object? */
export function isQuery(value: unknown): value is Query {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v['type'] === 'string' && v['type'].length > 0 && 'params' in v;
}

/**
 * Wrap a handler invocation with uniform error capture + timing. Never
 * throws — callers inspect `result.ok`.
 */
export async function invoke<T>(
  fn: () => Promise<T> | T,
  context: CommandContext,
): Promise<BusResult<T>> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, value, elapsedMs: Date.now() - start, context };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { ok: false, error, elapsedMs: Date.now() - start, context };
  }
}
