/**
 * Multi-Tenancy — Async-Safe Tenant Context
 *
 * Propagates the "current tenant" through async call chains without
 * explicit parameter threading. Two modes:
 *
 *   1. AsyncLocalStorage-backed (default in Node): context survives
 *      `await`, `Promise.then`, timers, event emitters — the only correct
 *      way to do ambient context in async code.
 *   2. Fallback stack (for non-Node runtimes where `async_hooks` is
 *      unavailable): works for synchronous runs only; `run` throws if the
 *      runtime can't propagate (fail loud, not silently wrong).
 *
 * `run` nests: an inner `run` shadows the outer tenant for its scope and
 * restores afterwards. `current()` outside any scope returns undefined —
 * callers that REQUIRE a tenant use `require()` which throws NO_CONTEXT.
 *
 * @module MultiTenancy/Tenancy
 */

import { TenantContextInfo, TenantError, TenantErrorCode } from './TenantTypes';

// AsyncLocalStorage via conditional require — the file stays importable in
// environments without async_hooks (tests still use Node/Bun, so it's there).
interface AlsLike {
  getStore(): TenantContextInfo | undefined;
  run<T>(store: TenantContextInfo, cb: () => T): T;
}

function loadAls(): AlsLike | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AsyncLocalStorage } = require('async_hooks') as {
      AsyncLocalStorage: new () => AlsLike;
    };
    return new AsyncLocalStorage();
  } catch {
    return undefined;
  }
}

export class TenantContext {
  private static _als: AlsLike | undefined = loadAls();
  private static _fallbackStack: TenantContextInfo[] = [];

  /**
   * Run `fn` with `info` as the ambient tenant. Nests correctly.
   * Works with async functions — the context flows through awaits inside fn.
   */
  static run<T>(info: TenantContextInfo, fn: () => T): T {
    if (this._als) {
      return this._als.run(info, fn);
    }
    // Synchronous fallback — safe only while fn never yields.
    this._fallbackStack.push(info);
    try {
      return fn();
    } finally {
      this._fallbackStack.pop();
    }
  }

  /** The ambient tenant, or undefined outside any `run` scope. */
  static current(): TenantContextInfo | undefined {
    if (this._als) return this._als.getStore();
    return this._fallbackStack[this._fallbackStack.length - 1];
  }

  /** Current tenant id or throw NO_CONTEXT. */
  static require(): TenantContextInfo {
    const c = this.current();
    if (!c) {
      throw new TenantError(TenantErrorCode.NO_CONTEXT, 'no tenant context — wrap the call in TenantContext.run()');
    }
    return c;
  }

  /** Current tenant id or a default. */
  static tenantIdOr(defaultId: string): string {
    return this.current()?.tenantId ?? defaultId;
  }

  /** Convenience: build + run. */
  static runWith<T>(tenantId: string, resolvedBy: TenantContextInfo['resolvedBy'], fn: () => T, attributes?: Record<string, string>): T {
    return this.run({ tenantId, resolvedBy, ...(attributes ? { attributes } : {}) }, fn);
  }
}
