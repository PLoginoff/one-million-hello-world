/**
 * SmartReference
 *
 * Smart-reference proxy combining virtual-proxy lazy loading with C++-style
 * RAII reference counting. Callers obtain a `Handle` via `acquire()`; each
 * handle must be `release()`d (or used with `using`-style `with()`). When the
 * last handle is released the underlying target is unloaded — the proxy
 * returns to its cheap, unloaded state and an `onUnload` hook can release
 * real resources (files, sockets).
 *
 * Reference-count semantics:
 *   - `acquire()` lazily loads the target (shared promise latch, like
 *     VirtualProxy) and returns a Handle carrying refId N.
 *   - `handle.release()` decrements the count exactly once (idempotent).
 *   - At count 0 the target is dropped asynchronously; a subsequent acquire
 *     reloads it.
 *   - An optional `idleMs` grace period delays actual unloading so rapid
 *     acquire→release→acquire cycles don't thrash the factory — the classic
 *     "smart pointer with hysteresis" used by connection pools.
 *
 * Safety: invoking through a released handle throws `ReleasedHandleError`.
 * `with()` guarantees release in a finally block — the recommended usage.
 *
 * @module ProxyLayer/Engine
 */

/**
 * Error thrown when using a handle after release.
 */
export class ReleasedHandleError extends Error {
  constructor(refId: number) {
    super(`Handle #${refId} has been released`);
    this.name = 'ReleasedHandleError';
  }
}

/**
 * Options for SmartReference.
 */
export interface SmartReferenceOptions<T> {
  /** Called after the target object is realized. */
  readonly onLoad?: (target: T) => void | Promise<void>;
  /** Called before the target object is dropped. */
  readonly onUnload?: (target: T) => void | Promise<void>;
  /**
   * Grace period before unloading after the last release, in ms.
   * Scheduled on a real timer; 0 = unload immediately on release.
   * Default 0.
   */
  readonly idleMs?: number;
}

/**
 * RAII handle to the referenced target.
 */
export class Handle<T extends object> {
  readonly refId: number;
  private readonly _owner: SmartReference<T>;
  private _released: boolean;

  /** @internal — created only by SmartReference. */
  constructor(refId: number, owner: SmartReference<T>) {
    this.refId = refId;
    this._owner = owner;
    this._released = false;
  }

  get released(): boolean {
    return this._released;
  }

  /**
   * Invokes a method on the referenced target.
   * @throws ReleasedHandleError after release().
   */
  async invoke<R = unknown>(method: keyof T & string, args: readonly unknown[] = []): Promise<R> {
    this._ensureLive();
    return this._owner._invokeThrough(this, method, args);
  }

  /** Reads a property on the referenced target. */
  async read<R = unknown>(property: keyof T & string): Promise<R> {
    this._ensureLive();
    return this._owner._readThrough(this, property);
  }

  /** Releases this handle. Idempotent; returns true on first release. */
  async release(): Promise<boolean> {
    if (this._released) {
      return false;
    }
    this._released = true;
    await this._owner._release(this);
    return true;
  }

  private _ensureLive(): void {
    if (this._released) {
      throw new ReleasedHandleError(this.refId);
    }
  }
}

export class SmartReference<T extends object> {
  private readonly _factory: () => T | Promise<T>;
  private readonly _options: SmartReferenceOptions<T>;

  private _target: T | null;
  private _pending: Promise<T> | null;
  private _refCount: number;
  private _nextRefId: number;
  private _loadCount: number;
  private _unloadCount: number;
  private _idleTimer: ReturnType<typeof setTimeout> | null;

  constructor(factory: () => T | Promise<T>, options: SmartReferenceOptions<T> = {}) {
    this._factory = factory;
    this._options = options;
    this._target = null;
    this._pending = null;
    this._refCount = 0;
    this._nextRefId = 0;
    this._loadCount = 0;
    this._unloadCount = 0;
    this._idleTimer = null;
  }

  /** Current outstanding handle count. */
  get refCount(): number {
    return this._refCount;
  }

  /** True while a target object is materialized. */
  get isLoaded(): boolean {
    return this._target !== null;
  }

  /** Lifetime load/unload counts for introspection. */
  get counters(): { loads: number; unloads: number } {
    return { loads: this._loadCount, unloads: this._unloadCount };
  }

  /**
   * Acquires a handle, loading the target if necessary. Cancels any pending
   * idle-grace unload.
   */
  async acquire(): Promise<Handle<T>> {
    this._cancelIdleTimer();
    await this._ensureLoaded();
    this._refCount += 1;
    return new Handle<T>(++this._nextRefId, this);
  }

  /**
   * Convenience RAII: acquire, run `fn`, release in finally.
   * The handle must not escape `fn` (its release is enforced regardless).
   */
  async with<R>(fn: (handle: Handle<T>) => R | Promise<R>): Promise<R> {
    const handle = await this.acquire();
    try {
      return await fn(handle);
    } finally {
      await handle.release();
    }
  }

  /**
   * Forces immediate unload regardless of refCount. Outstanding handles
   * become dangling — subsequent use throws ReleasedHandleError semantics
   * via re-acquire requirements; the target itself is dropped now.
   */
  async forceUnload(): Promise<boolean> {
    this._cancelIdleTimer();
    if (this._target === null) {
      return false;
    }
    await this._unload();
    return true;
  }

  /** @internal */
  async _invokeThrough<R>(_handle: Handle<T>, method: keyof T & string, args: readonly unknown[]): Promise<R> {
    const target = await this._ensureLoaded();
    const fn = target[method];
    if (typeof fn !== 'function') {
      throw new TypeError(`SmartReference: '${method}' is not callable on target`);
    }
    return (await (fn as (...a: unknown[]) => unknown).apply(target, [...args])) as R;
  }

  /** @internal */
  async _readThrough<R>(_handle: Handle<T>, property: keyof T & string): Promise<R> {
    const target = await this._ensureLoaded();
    return target[property] as R;
  }

  /** @internal — decrements the count and maybe unloads. */
  async _release(_handle: Handle<T>): Promise<void> {
    if (this._refCount > 0) {
      this._refCount -= 1;
    }
    if (this._refCount === 0 && this._target !== null) {
      const idleMs = this._options.idleMs ?? 0;
      if (idleMs <= 0) {
        await this._unload();
      } else {
        // Grace period: a real timer schedules the unload; any acquire()
        // before it fires cancels it (hysteresis against thrashing).
        this._idleTimer = setTimeout(() => {
          this._idleTimer = null;
          if (this._refCount === 0 && this._target !== null) {
            void this._unload();
          }
        }, idleMs);
        // Do not hold the process open for a pending unload.
        const timer = this._idleTimer as unknown as { unref?: () => void };
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      }
    }
  }

  /**
   * Flushes a pending idle-unload immediately. Mostly for tests that want
   * the unload to happen deterministically without waiting out the timer.
   */
  async flushPendingUnload(): Promise<void> {
    this._cancelIdleTimer();
    if (this._refCount === 0 && this._target !== null) {
      await this._unload();
    }
  }

  private _cancelIdleTimer(): void {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  private async _ensureLoaded(): Promise<T> {
    if (this._target !== null) {
      return this._target;
    }
    if (this._pending !== null) {
      return this._pending;
    }
    const factory = this._factory;
    this._pending = (async () => factory())();
    try {
      const instance = await this._pending;
      this._target = instance;
      this._loadCount += 1;
      if (this._options.onLoad) {
        await this._options.onLoad(instance);
      }
      return instance;
    } finally {
      this._pending = null;
    }
  }

  private async _unload(): Promise<void> {
    const target = this._target;
    this._target = null;
    if (target !== null) {
      if (this._options.onUnload) {
        await this._options.onUnload(target);
      }
      this._unloadCount += 1;
    }
  }
}
