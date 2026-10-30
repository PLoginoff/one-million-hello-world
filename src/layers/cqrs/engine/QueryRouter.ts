/**
 * QueryRouter — dispatch queries to the right read model.
 *
 * In CQRS a query like `GetOrdersByCustomer(customerId)` is served by a
 * specific denormalized view, not by the aggregate store. The router holds
 * the mapping: query type → read model + accessor.
 *
 *   router.register('GetOrdersByCustomer', {
 *     model: 'orders-by-customer',
 *     run: (q, store) => store.findBy('orders-by-customer', 'customerId', q.customerId),
 *   });
 *   await router.dispatch({ type: 'GetOrdersByCustomer', params: { customerId: 'c1' } });
 *
 * Features beyond a plain Map:
 *   - Staleness guard: routes may declare `maxLagEvents`; if the backing
 *     projection's checkpoint is too far behind the write head, dispatch
 *     fails fast with `StaleReadError` — the caller can retry, fall back
 *     to the write side, or show a "updating…" state instead of silently
 *     serving stale data.
 *   - Fallback chain: routes may declare `fallback` executed when the
 *     primary read model misses (undefined result or throws) — e.g. serve
 *     a slightly-less-fresh aggregate query.
 *   - `listRoutes()` exposes the routing table for docs/dashboards.
 *
 * @module CqrsLayer/Engine
 */

import { ReadModelStore } from './ReadModelStore';

export interface Query<TParams = Record<string, unknown>> {
  readonly type: string;
  readonly params: TParams;
}

export class UnknownQueryError extends Error {
  constructor(type: string) {
    super(`no route registered for query type '${type}'`);
    this.name = 'UnknownQueryError';
  }
}

export class StaleReadError extends Error {
  readonly queryType: string;
  readonly lag: number;
  readonly maxLag: number;
  constructor(queryType: string, lag: number, maxLag: number) {
    super(
      `query '${queryType}' refused: backing projection lags ${lag} events ` +
        `(max allowed ${maxLag})`
    );
    this.name = 'StaleReadError';
    this.queryType = queryType;
    this.lag = lag;
    this.maxLag = maxLag;
  }
}

/** What a route does with the query + store. Returns the query result. */
export type RouteHandler<TParams = Record<string, unknown>, TResult = unknown> = (
  query: Query<TParams>,
  store: ReadModelStore
) => TResult | Promise<TResult>;

export interface QueryRoute<TParams = Record<string, unknown>, TResult = unknown> {
  /** Read model this route reads from (documentation + staleness checks). */
  readonly model: string;
  /** Projection whose checkpoint gates staleness (defaults to model name). */
  readonly projection?: string;
  /** Refuse to serve when checkpoint lags head by more than this. */
  readonly maxLagEvents?: number;
  readonly run: RouteHandler<TParams, TResult>;
  /** Optional fallback when `run` returns undefined or throws. */
  readonly fallback?: RouteHandler<TParams, TResult>;
}

export interface RouteInfo {
  readonly type: string;
  readonly model: string;
  readonly projection: string;
  readonly maxLagEvents: number | null;
}

export class QueryRouter {
  private readonly _store: ReadModelStore;
  private readonly _head: () => number;
  private readonly _routes = new Map<string, QueryRoute<Record<string, unknown>, unknown>>();

  constructor(store: ReadModelStore, headSupplier: () => number) {
    this._store = store;
    this._head = headSupplier;
  }

  register<TParams extends Record<string, unknown>, TResult>(
    type: string,
    route: QueryRoute<TParams, TResult>
  ): this {
    this._routes.set(
      type,
      route as unknown as QueryRoute<Record<string, unknown>, unknown>
    );
    return this;
  }

  /**
   * Dispatch a query to its route.
   * @throws UnknownQueryError, StaleReadError, or the handler's own error
   *         (when no fallback is registered).
   */
  async dispatch<TParams extends Record<string, unknown>, TResult = unknown>(
    query: Query<TParams>
  ): Promise<TResult> {
    const route = this._routes.get(query.type);
    if (!route) throw new UnknownQueryError(query.type);

    if (route.maxLagEvents !== undefined) {
      const projection = route.projection ?? route.model;
      const applied = this._store.checkpoint(projection);
      const lag = Math.max(0, this._head() - applied);
      if (lag > route.maxLagEvents) {
        throw new StaleReadError(query.type, lag, route.maxLagEvents);
      }
    }

    try {
      const result = await route.run(query as Query<Record<string, unknown>>, this._store);
      if (result === undefined && route.fallback) {
        return (await route.fallback(
          query as Query<Record<string, unknown>>, this._store
        )) as TResult;
      }
      return result as TResult;
    } catch (e) {
      if (route.fallback) {
        return (await route.fallback(
          query as Query<Record<string, unknown>>, this._store
        )) as TResult;
      }
      throw e;
    }
  }

  has(type: string): boolean {
    return this._routes.has(type);
  }

  listRoutes(): RouteInfo[] {
    const out: RouteInfo[] = [];
    for (const [type, r] of this._routes) {
      out.push({
        type,
        model: r.model,
        projection: r.projection ?? r.model,
        maxLagEvents: r.maxLagEvents ?? null,
      });
    }
    return out;
  }
}
