/**
 * Controller Lifecycle — init/dispose hooks + dependency injection.
 *
 * A minimal DI container and a lifecycle-aware dispatcher:
 *
 *   container.register('db', () => new Db());
 *   const runner = new ControllerRunner(container);
 *   runner.register('users', new UsersController());
 *
 * Hook order per request:
 *   beforeRequest → handle → afterRequest(always, even on throw)
 *
 * Container semantics:
 *   - `register(token, factory, { singleton })` — singletons cache on
 *     first resolve; transients invoke the factory per resolve.
 *   - `resolve(token)` throws `UnregisteredTokenError` on miss —
 *     silent `undefined` would defer the failure to a property access.
 *   - `createScope()` makes a child container; scoped registrations
 *     shadow the parent's without mutating it (per-request lifetimes).
 *
 * @module ControllerLayer/Engine
 */

import {
  ControllerRequestContext,
  DiToken,
  LifecycleController,
} from './streaming-types';

// ---------------------------------------------------------------------------
// DI container
// ---------------------------------------------------------------------------

/** Raised when `resolve` hits an unknown token. */
export class UnregisteredTokenError extends Error {
  constructor(token: DiToken) {
    super(`No registration for token ${String(token)}`);
    this.name = 'UnregisteredTokenError';
  }
}

interface Registration<T = unknown> {
  readonly factory: (c: DiContainer) => T;
  readonly singleton: boolean;
  instance?: T;
  resolved?: boolean;
}

/** Options for a registration. */
export interface RegisterOptions {
  /** Cache the produced instance (default true). */
  readonly singleton?: boolean;
}

/**
 * DI container with parent scopes.
 *
 * Resolution walks `self → parent → …` — first match wins, so a scope
 * can shadow a global service with a request-local stub.
 */
export class DiContainer {
  private readonly _registrations: Map<DiToken, Registration>;
  private readonly _parent: DiContainer | null;

  constructor(parent?: DiContainer) {
    this._registrations = new Map();
    this._parent = parent ?? null;
  }

  /** Register a factory under `token`. */
  register<T>(token: DiToken, factory: (c: DiContainer) => T, options?: RegisterOptions): this {
    this._registrations.set(token, {
      factory: factory as (c: DiContainer) => unknown,
      singleton: options?.singleton ?? true,
    });
    return this;
  }

  /** Register a ready-made instance (always a singleton). */
  registerInstance<T>(token: DiToken, instance: T): this {
    this._registrations.set(token, {
      factory: () => instance,
      singleton: true,
      instance,
      resolved: true,
    });
    return this;
  }

  /** Resolve a token — throws {@link UnregisteredTokenError} on miss. */
  resolve<T>(token: DiToken): T {
    const reg = this._registrations.get(token);
    if (reg !== undefined) {
      if (reg.singleton) {
        if (reg.resolved !== true) {
          reg.instance = reg.factory(this);
          reg.resolved = true;
        }
        return reg.instance as T;
      }
      return reg.factory(this) as T;
    }
    if (this._parent !== null) {
      return this._parent.resolve<T>(token);
    }
    throw new UnregisteredTokenError(token);
  }

  /** Whether the token resolves here or in an ancestor. */
  has(token: DiToken): boolean {
    return this._registrations.has(token) || this._parent?.has(token) === true;
  }

  /** Child scope — registrations added there don't leak upward. */
  createScope(): DiContainer {
    return new DiContainer(this);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle runner
// ---------------------------------------------------------------------------

/** Correlation id source. */
export type CorrelationIdFactory = () => string;

/** Options for {@link ControllerRunner}. */
export interface ControllerRunnerOptions {
  readonly container?: DiContainer;
  readonly correlationId?: CorrelationIdFactory;
}

/** Dispatch outcome with hook timings. */
export interface ControllerRunResult {
  readonly value: unknown;
  readonly correlationId: string;
  readonly hooksMs: { before: number; handler: number; after: number };
}

/**
 * Lifecycle-aware dispatcher.
 *
 * One `init()` pass on first use (lazy — constructors shouldn't do I/O);
 * `dispose()` runs hooks in reverse registration order (LIFO teardown,
 * mirroring how dependency-graph shutdowns work).
 */
export class ControllerRunner {
  private readonly _container: DiContainer;
  private readonly _correlationId: CorrelationIdFactory;
  private readonly _controllers: Map<string, LifecycleController>;
  private _initialized: boolean;
  private _disposed: boolean;
  private _idSeq: number;

  constructor(options?: ControllerRunnerOptions) {
    this._container = options?.container ?? new DiContainer();
    this._correlationId = options?.correlationId ?? (() => `req-${++this._idSeq}`);
    this._controllers = new Map();
    this._initialized = false;
    this._disposed = false;
    this._idSeq = 0;
  }

  /** Whether init() has run. */
  get initialized(): boolean {
    return this._initialized;
  }

  /** Whether dispose() has run. */
  get disposed(): boolean {
    return this._disposed;
  }

  /** Register a controller under a name (dispatch key). */
  register(name: string, controller: LifecycleController): this {
    this._controllers.set(name, controller);
    return this;
  }

  /** Lazy-init: run `init` hooks once, in registration order. */
  async init(): Promise<void> {
    if (this._initialized || this._disposed) {
      return;
    }
    const ctx = this.makeContext('__init__');
    for (const c of this._controllers.values()) {
      await c.lifecycle?.init?.(ctx);
    }
    this._initialized = true;
  }

  /** Dispatch a request through hooks + handler. */
  async run(name: string, path: string, scope?: DiContainer): Promise<ControllerRunResult> {
    if (this._disposed) {
      throw new Error('ControllerRunner.run: disposed');
    }
    await this.init();
    const controller = this._controllers.get(name);
    if (controller === undefined) {
      throw new Error(`No controller registered as '${name}'`);
    }
    const ctx = this.makeContext(path, scope);

    const t0 = now();
    await controller.lifecycle?.beforeRequest?.(ctx);
    const t1 = now();

    let value: unknown;
    let handlerMs: number;
    try {
      value = await controller.handle(ctx);
      handlerMs = now() - t1;
    } catch (err) {
      handlerMs = now() - t1;
      // afterRequest still runs on failure — parity with finally {}.
      const t2 = now();
      await controller.lifecycle?.afterRequest?.(ctx);
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
        __controllerRun: { hooksMs: { before: t1 - t0, handler: handlerMs, after: now() - t2 } },
      });
    }

    const t2 = now();
    await controller.lifecycle?.afterRequest?.(ctx);
    const afterMs = now() - t2;

    return {
      value,
      correlationId: ctx.correlationId,
      hooksMs: { before: t1 - t0, handler: handlerMs, after: afterMs },
    };
  }

  /** Run `dispose` hooks in reverse registration order. */
  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    const ctx = this.makeContext('__dispose__');
    const controllers = [...this._controllers.values()].reverse();
    for (const c of controllers) {
      await c.lifecycle?.dispose?.(ctx);
    }
    this._controllers.clear();
  }

  /** Number of registered controllers. */
  get controllerCount(): number {
    return this._controllers.size;
  }

  private makeContext(path: string, scope?: DiContainer): ControllerRequestContext {
    const container = scope ?? this._container;
    return {
      path,
      correlationId: this._correlationId(),
      state: {},
      resolve: <T,>(token: DiToken): T => container.resolve<T>(token),
    };
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
