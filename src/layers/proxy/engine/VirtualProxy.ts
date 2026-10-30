/**
 * VirtualProxy
 *
 * Lazy-initializing proxy for expensive targets. The real subject is created
 * by a factory thunk on the FIRST invocation, not at proxy construction time —
 * the classic GoF "virtual proxy" applied to heavy resources (parsers,
 * connection pools, large document models).
 *
 * Concurrency: initialization is guarded by a shared-promise latch so
 * concurrent first-callers trigger exactly ONE factory call — the
 * promise itself acts as the synchronization token (memoized-async pattern).
 * A failed factory call clears the latch so the next caller retries.
 *
 * Unload: `reset()` drops the realized target, returning the proxy to its
 * unloaded state. If an unload hook is registered it receives the discarded
 * instance (e.g. to close sockets).
 *
 * @module ProxyLayer/Engine
 */

/**
 * Factory producing the real subject. May be async.
 */
export type TargetFactory<T> = () => T | Promise<T>;

/**
 * Options for VirtualProxy.
 */
export interface VirtualProxyOptions<T> {
  /** Called with the discarded instance on reset() / failed re-init. */
  readonly onUnload?: (target: T) => void | Promise<void>;
  /** Called once after successful realization (e.g. warm-up logging). */
  readonly onLoad?: (target: T) => void | Promise<void>;
}

export class VirtualProxy<T extends object> {
  private readonly _factory: TargetFactory<T>;
  private readonly _options: VirtualProxyOptions<T>;
  private _target: T | null;
  private _pending: Promise<T> | null;
  private _initCount: number;
  private _loadCount: number;

  constructor(factory: TargetFactory<T>, options: VirtualProxyOptions<T> = {}) {
    this._factory = factory;
    this._options = options;
    this._target = null;
    this._pending = null;
    this._initCount = 0;
    this._loadCount = 0;
  }

  /**
   * True once the target has been realized and not subsequently unloaded.
   */
  get isLoaded(): boolean {
    return this._target !== null;
  }

  /**
   * Number of factory calls attempted (includes failures).
   */
  get initCount(): number {
    return this._initCount;
  }

  /**
   * Number of successful realizations.
   */
  get loadCount(): number {
    return this._loadCount;
  }

  /**
   * The realized target, or null when unloaded. Does NOT trigger loading —
   * use `invoke` / `get` for that.
   */
  peek(): T | null {
    return this._target;
  }

  /**
   * Realizes the target if needed and returns it.
   * Concurrent callers share a single in-flight factory promise.
   */
  async get(): Promise<T> {
    if (this._target !== null) {
      return this._target;
    }
    if (this._pending !== null) {
      return this._pending;
    }

    const factory = this._factory;
    this._initCount += 1;

    this._pending = (async () => {
      const instance = await factory();
      return instance;
    })();

    try {
      const instance = await this._pending;
      this._target = instance;
      this._loadCount += 1;
      if (this._options.onLoad) {
        await this._options.onLoad(instance);
      }
      return instance;
    } catch (error) {
      // Clear the latch so the next call retries the factory.
      throw error;
    } finally {
      this._pending = null;
    }
  }

  /**
   * Invokes a method on the realized target, loading it on first use.
   *
   * @param method - Property name of a callable on the target.
   * @param args - Arguments forwarded verbatim.
   * @returns The method's return value (awaited when a promise).
   * @throws TypeError when `method` is not callable on the target.
   */
  async invoke<R = unknown>(method: keyof T & string, args: readonly unknown[] = []): Promise<R> {
    const target = await this.get();
    const fn = target[method];
    if (typeof fn !== 'function') {
      throw new TypeError(`VirtualProxy: '${method}' is not callable on target`);
    }
    return (await (fn as (...a: unknown[]) => unknown).apply(target, [...args])) as R;
  }

  /**
   * Reads a non-method property from the realized target, loading on demand.
   */
  async read<R = unknown>(property: keyof T & string): Promise<R> {
    const target = await this.get();
    return target[property] as R;
  }

  /**
   * Discards the realized target (if any) and returns to the unloaded state.
   * A subsequent `invoke` re-runs the factory. Safe when already unloaded;
   * returns false in that case.
   */
  async reset(): Promise<boolean> {
    const target = this._target;
    if (target === null) {
      return false;
    }
    this._target = null;
    if (this._options.onUnload) {
      await this._options.onUnload(target);
    }
    return true;
  }
}
